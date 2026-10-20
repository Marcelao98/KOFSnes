// Núcleos em arquivos separados (dist/web/nucleos/<núcleo>-<hash>.js): o html abre sem nenhum núcleo carregado, cada
// núcleo só entra quando abre um jogo daquele console (e só ele), e se a pasta nucleos/ não estiver do lado do html o
// app avisa "faltou baixar o núcleo..." sem quebrar. Roda no PC (KOFnes.html) e no celular (KOFnes-android.html).
//   node testes/navegador/nucleos.cjs dist/web rom.gb rom.nes rom.md rom.sfc [rom.gba]
// Use só ROM de teste LIVRE ou gerada (dmg-acid2, nes-test-roms, PeterLemon/SNES, uma de Mega Drive escrita à mão).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta, romGb, romNes, romMd, romSnes, romGba] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  // pelo campo de arquivo do app (o mesmo que o botão Abrir usa), que funciona com ou sem jogo aberto
  const abrir = async (p, rom) => { await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2000); };
  const scripts = (p) => p.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')));
  const estado = (p) => p.evaluate(() => { const s = KOFnes.nucleo(); return s ? { nucleo: s.lr ? s.nucleo : 'kof', quadros: s.quadros || 0 } : null; });
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    conferir((await scripts(p)).length === 0, `${nome}: abre sem nenhum núcleo carregado`);
    const tamanho = fs.statSync(path.resolve(pasta, arq)).size;
    conferir(tamanho < 1.5e6, `${nome}: html sem núcleo dentro (${Math.round(tamanho / 1024)} KB)`);
    const esperado = [];
    for (const [rom, nucleo] of [[romGb, 'gambatte'], [romNes, 'fceumm'], [romMd, 'genplus'], ...(romGba ? [[romGba, 'mgba']] : []), ...(cel ? [[romSnes, 'snes9x']] : [])]) {
      await abrir(p, rom);
      esperado.push(nucleo);
      const s = await estado(p), sc = await scripts(p);
      conferir(s && s.nucleo === nucleo && s.quadros > 10, `${nome}: ${path.basename(rom)} roda no ${nucleo} (${s && s.quadros} quadros)`);
      conferir(sc.length === esperado.length && esperado.every((n, i) => new RegExp(`^nucleos/${n}-[0-9a-f]{8}\\.js$`).test(sc[i])), `${nome}: núcleos carregados até aqui: ${sc.join(', ')}`);
    }
    if (!cel) {   // SNES no PC continua no núcleo Kof, sem carregar núcleo nenhum
      await abrir(p, romSnes);
      conferir((await estado(p)).nucleo === 'kof' && (await scripts(p)).length === esperado.length, 'pc: SNES no núcleo Kof');
    }
    conferir(erros.length === 0, `${nome}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
  // sem a pasta nucleos/: o app avisa e continua de pé
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kof-sem-nucleos-'));
  fs.copyFileSync(path.resolve(pasta, 'KOFnes.html'), path.join(tmp, 'KOFnes.html'));
  const p = await b.newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.join(tmp, 'KOFnes.html')); await p.waitForTimeout(800);
  await abrir(p, romGb);
  const aviso = await p.evaluate(() => document.body.innerText);
  conferir(/faltou baixar o núcleo do Game Boy/.test(aviso), 'sem a pasta: avisa "faltou baixar o núcleo do Game Boy"');
  await abrir(p, romSnes);
  conferir((await estado(p)).nucleo === 'kof', 'sem a pasta: SNES continua abrindo');
  conferir(erros.length === 0, 'sem a pasta: sem erro na página ' + erros.join(' | '));
  fs.rmSync(tmp, { recursive: true });
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
