// PlayStation (PCSX-ReARMed): abre um executável de PS1 (.exe), um CD em .cue + .bin escolhidos juntos e um .cue sozinho
// (o app pede o .bin), um .bin sozinho, no PC e no celular. Confere tela, quadros, cores, savestate, que o CD não vai pro banco e os nomes
// ✕ ○ □ △ L1 R1 no controle do celular.
//   node testes/navegador/ps1.cjs dist/web Cube.exe "Cubo de Teste.cue" "Cubo de Teste.bin" [prints/]
// Use só programa LIVRE (ex.: os testes do PeterLemon/PSX) ou um CD montado com eles (genisoimage + SYSTEM.CNF).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const os = require('os'), path = require('path');
const [,, pasta, exe, cue, bin, saida = os.tmpdir()] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const estado = (p) => p.evaluate(() => { const s = KOFnes.nucleo(); if (!s) return null; const c = new Set(); for (let i = 0; i < s.rgba.length; i += 5) c.add(s.rgba[i]); return { nucleo: s.nucleo, tela: s.largura + 'x' + s.altura, quadros: s.quadros, titulo: s.cart.title, cores: c.size, sis: document.body.dataset.sis }; });
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    // 1) executável
    await p.setInputFiles('#arquivo', exe); await p.waitForTimeout(3500);
    let s = await estado(p);
    conferir(s && s.nucleo === 'pcsx' && s.tela === '320x240' && s.quadros > 30 && s.cores > 30 && s.sis === 'ps1', `${nome}: executável de PS1 roda ${JSON.stringify(s)}`);
    await p.screenshot({ path: path.join(saida, `ps1-${nome}-exe.png`) });
    if (cel) {
      const ctl = await p.evaluate(() => Object.fromEntries(['B', 'A', 'Y', 'X', 'L', 'R'].map((k) => [k, document.querySelector(`#ctl [data-b="${k}"]`).textContent])));
      conferir(ctl.B === '✕' && ctl.A === '○' && ctl.Y === '□' && ctl.X === '△' && ctl.L === 'L1' && ctl.R === 'R1', 'celular: controle ✕ ○ □ △ L1 R1 ' + JSON.stringify(ctl));
    }
    // savestate
    const est = await p.evaluate(() => { const s = KOFnes.nucleo(), a = s.serializar(); for (let i = 0; i < 5; i++) s.runFrame(); return s.desserializar(a) && a.length; });
    conferir(est > 100000, `${nome}: savestate guarda e volta (${est} bytes)`);
    // 2) .cue e .bin escolhidos juntos
    await p.setInputFiles('#arquivo', [cue, bin]); await p.waitForTimeout(3500);
    s = await estado(p);
    conferir(s && s.nucleo === 'pcsx' && s.titulo === path.basename(cue, '.cue') && s.quadros > 30 && s.cores > 30, `${nome}: CD em .cue + .bin roda ${JSON.stringify(s)}`);
    const noBanco = await p.evaluate(() => new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => { const t = q.result.transaction('roms').objectStore('roms').getAllKeys(); t.onsuccess = () => ok(t.result.filter((k) => /Cubo de Teste/.test(k)).length); }; }));
    conferir(noBanco === 0, `${nome}: o CD não foi guardado no banco (${noBanco})`);
    // .bin sozinho (sem .cue): reconhecido como CD de PS1 pelo conteúdo, não como Mega Drive
    await p.setInputFiles('#arquivo', bin); await p.waitForTimeout(3500);
    s = await estado(p);
    conferir(s && s.nucleo === 'pcsx' && s.titulo === path.basename(bin, '.bin') && s.quadros > 30, `${nome}: .bin sozinho abre como CD de PS1 ${JSON.stringify(s)}`);
    // 3) .cue sozinho: o app pede o .bin
    if (!cel) {
      await p.setInputFiles('#arquivo', exe); await p.waitForTimeout(2500);
      const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.setInputFiles('#arquivo', cue)]);
      await fc.setFiles(bin); await p.waitForTimeout(3500);
      s = await estado(p);
      conferir(s && s.nucleo === 'pcsx' && s.quadros > 30 && s.quadros < 400 && s.titulo === path.basename(cue, '.cue'), `pc: .cue sozinho pede o .bin e roda ${JSON.stringify(s)}`);
    }
    conferir(erros.length === 0, `${nome}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
