// GBA (mGBA): abre uma ROM .gba no PC e no celular, confere a tela 240x160 (3:2), o controle virtual com L e R (sem X e
// Y), a BIOS escolhida pelo usuário guardada no banco (Arquivo > BIOS…) e o save de 128 KB guardado sem o fim vazio.
//   node testes/navegador/gba.cjs dist/web rom.gba [prints/]
// Use só ROM de teste LIVRE ou gerada (ex.: jsmolka/gba-tests). A "BIOS" do teste é um arquivo de zeros, não a de verdade.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const [,, pasta, rom, saida = os.tmpdir()] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const abrir = async (p) => { await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2000); };
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    await abrir(p);
    const s = await p.evaluate(() => { const s = KOFnes.nucleo(); return { nucleo: s.nucleo, tela: s.largura + 'x' + s.altura, prop: s.proporcao, quadros: s.quadros, sis: document.body.dataset.sis }; });
    conferir(s.nucleo === 'mgba' && s.tela === '240x160' && Math.abs(s.prop - 1.5) < 0.01 && s.quadros > 10 && s.sis === 'gba', `${nome}: roda no mGBA ${JSON.stringify(s)}`);
    if (cel) {
      const vis = await p.evaluate(() => Object.fromEntries(['A', 'B', 'X', 'Y', 'L', 'R'].map((k) => [k, getComputedStyle(document.querySelector(`#ctl [data-b="${k}"]`)).display !== 'none'])));
      conferir(vis.A && vis.B && vis.L && vis.R && !vis.X && !vis.Y, 'celular: controle com A, B, L, R e sem X, Y ' + JSON.stringify(vis));
    }
    await p.screenshot({ path: path.join(saida, `gba-${nome}.png`) });
    // save: grava 1 byte no começo, salva, reabre a página e confere que voltou (e o resto em 0xFF)
    await p.evaluate(() => { const s = KOFnes.nucleo(); s.cart.sram[0] = 0x12; s.cart.sram[5] = 0x34; document.dispatchEvent(new Event('visibilitychange')); });
    await p.evaluate(() => dispatchEvent(new Event('pagehide')));
    const tam = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('kofnes.sram.')).map(([, v]) => v.length)[0] || 0);
    conferir(tam > 0 && tam < 100, `${nome}: save guardado sem o fim vazio (${tam} caracteres em vez de ~175 mil)`);
    await p.reload(); await p.waitForTimeout(800); await abrir(p);
    const volta = await p.evaluate(() => { const s = KOFnes.nucleo().cart.sram; return [s[0], s[5], s[1000], s[s.length - 1]]; });
    conferir(volta.join() === [0x12, 0x34, 0xFF, 0xFF].join(), `${nome}: save voltou ao reabrir (${volta})`);
    if (!cel) {   // BIOS: escolhe um arquivo de 16 KB chamado gba_bios.bin
      const bios = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kof-bios-')), 'gba_bios.bin');
      fs.writeFileSync(bios, Buffer.alloc(16384));
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.evaluate(() => document.querySelector('[data-acao="bios"]').click())]);
      await fc.setFiles(bios); await p.waitForTimeout(800);
      const aviso = await p.evaluate(() => document.body.innerText.includes('BIOS do Game Boy Advance guardada'));
      const noBanco = await p.evaluate(() => new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => { const g = q.result.transaction('bios').objectStore('bios').get('gba_bios.bin'); g.onsuccess = () => ok(g.result ? g.result.sistema + ':' + g.result.dados.length : null); }; }));
      conferir(aviso && noBanco === 'gba:16384', `pc: BIOS guardada (${noBanco})`);
      fs.rmSync(path.dirname(bios), { recursive: true });
    }
    conferir(erros.length === 0, `${nome}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
