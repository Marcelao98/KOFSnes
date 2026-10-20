// Neo Geo (FBNeo) no app com zips FALSOS (testes/neogeo/zip-falso.py: nomes e CRCs certos, conteúdo zerado; a tela fica
// preta, mas o caminho todo roda): zip reconhecido pelo nome e aberto inteiro, tela "falta a BIOS" e o jogo abrindo
// sozinho depois de escolher, 304x224, botões A/B/C/D/FICHA no celular (sem L/R), clone sem o pai (aviso com o nome do
// zip) e com o pai na biblioteca (abre), savestate e a jukebox com os 14 canais.
// O jogo é aberto com outro nome ("Meu jogo de Neo Geo (Brasil).zip"): o app acha o set pelos CRCs de dentro do zip.
//   node testes/navegador/neogeo.cjs dist/web neogeo.zip mslug.zip 2020bb.zip 2020bba-split.zip [prints/]
// O clone precisa se chamar 2020bba.zip na hora de abrir: o teste copia pra uma pasta temporária.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta, bios, jogo, pai, cloneSplit, saida = os.tmpdir()] = process.argv;
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kof-neo-')), clone = path.join(tmp, '2020bba.zip');
  fs.copyFileSync(cloneSplit, clone);
  // o jogo vai com um nome que não é o do FBNeo: tem que ser reconhecido pelo conteúdo (CRCs dentro do zip)
  const jogoRenomeado = path.join(tmp, 'Meu jogo de Neo Geo (Brasil).zip');
  fs.copyFileSync(jogo, jogoRenomeado);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const abrir = async (p, rom) => { await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500); };
  const estado = (p) => p.evaluate(() => { const s = KOFnes.nucleo(); return s ? { nucleo: s.nucleo, tela: s.largura + 'x' + s.altura, titulo: s.cart.title, quadros: s.quadros, sis: document.body.dataset.sis } : null; });
  const KOFnesNeo = (s) => !/Meu jogo/.test(s.titulo);   // o título vem da lista do FBNeo, não do nome do arquivo
  const texto = (p) => p.evaluate(() => document.body.innerText);
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    // sem BIOS: abre a tela pedindo o neogeo.zip
    await abrir(p, jogoRenomeado);
    conferir(await p.isVisible('#bios-tela') && !(await estado(p)), `${nome}: sem BIOS, aparece a tela pedindo o neogeo.zip`);
    await p.screenshot({ path: path.join(saida, `neo-${nome}-bios.png`) });
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#bios-tela [data-acao="bios"]')]);
    await fc.setFiles(bios); await p.waitForTimeout(3500);
    const s = await estado(p);
    conferir(s && s.nucleo === 'fbneo' && s.tela === '304x224' && s.sis === 'neogeo' && s.quadros > 10 && s.titulo.length > 3 && KOFnesNeo(s) && await p.isHidden('#bios-tela'),
      `${nome}: zip com outro nome reconhecido pelo conteúdo; escolhida a BIOS, o jogo abre sozinho ${JSON.stringify(s)}`);
    if (cel) {
      const ctl = await p.evaluate(() => Object.fromEntries(['B', 'A', 'Y', 'X', 'Select', 'L', 'R'].map((k) => { const e = document.querySelector(`#ctl [data-b="${k}"]`); return [k, getComputedStyle(e).display === 'none' ? '-' : e.textContent]; })));
      conferir(ctl.B === 'A' && ctl.A === 'B' && ctl.Y === 'C' && ctl.X === 'D' && ctl.Select === 'FICHA' && ctl.L === '-' && ctl.R === '-', 'celular: controle A B C D FICHA, sem L/R ' + JSON.stringify(ctl));
    }
    await p.screenshot({ path: path.join(saida, `neo-${nome}-jogo.png`) });
    // savestate
    const est = await p.evaluate(() => { const s = KOFnes.nucleo(), a = s.serializar(); for (let i = 0; i < 5; i++) s.runFrame(); return s.desserializar(a) && a.length; });
    conferir(est > 100000, `${nome}: savestate guarda e volta (${est} bytes)`);
    // clone "split" sem o pai: avisa qual zip falta
    await abrir(p, clone);
    conferir(/precisa também do 2020bb\.zip/.test(await texto(p)), `${nome}: clone sem o pai avisa que falta o 2020bb.zip`);
    // abre o pai (vai pra biblioteca) e depois o clone: acha o pai sozinho
    await abrir(p, pai); await abrir(p, clone);
    const c = await estado(p);
    conferir(c && /set 2/.test(c.titulo) && c.tela === '304x224', `${nome}: com o pai na biblioteca, o clone abre ${JSON.stringify(c)}`);
    // jukebox: guarda a "música" e toca com 14 canais
    if (!cel) {
      await p.keyboard.press('F7'); await p.waitForTimeout(800);
      await p.evaluate(() => document.querySelector('[data-acao="jukebox"]').click()); await p.waitForTimeout(800);
      await p.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].pop().click()); await p.waitForTimeout(2500);
      const j = await p.evaluate(() => ({ ...KOFnes.juke(), barras: document.querySelectorAll('#jk-vozes .jk-voz').length }));
      conferir(j.tocando && j.barras === 14, `pc: jukebox toca a faixa do Neo Geo com 14 canais (${j.barras})`);
      await p.screenshot({ path: path.join(saida, `neo-${nome}-jukebox.png`) });
    }
    conferir(erros.length === 0, `${nome}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
