const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, spc, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true });
  const p = await ctx.newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(4000);
  const J = () => p.evaluate(() => KOFnes.juke());
  await p.keyboard.press('F7'); await p.waitForTimeout(600); r.avisoF7 = await p.textContent('#aviso');
  await p.click('#menu .m > button:text-is("Som")'); await p.click('.sub [data-acao="jukebox"]'); await p.waitForTimeout(400);
  r.abriu = await p.isVisible('#jukebox'); r.faixas = (await J()).faixas;
  await p.click('.jk-faixa >> nth=0'); await p.waitForTimeout(1500);
  const j1 = await J(); r.tocando = j1.tocando; r.amostras1 = j1.amostras; r.jogoPausado = await p.evaluate(() => KOFnes.pausado());
  await p.waitForTimeout(1000); r.amostrasAndam = (await J()).amostras > j1.amostras;
  r.vozesAcesas = await p.$$eval('.jk-voz i', (l) => l.filter((i) => parseFloat(i.style.height) > 0).length);
  await p.screenshot({ path: saida + '/jukebox.png' });
  await p.click('.jk-voz >> nth=0'); r.mudas = (await J()).mudas;
  // abrir .spc
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('#jukebox [data-acao="abrir-spc"]')]);
  await fc2.setFiles(spc); await p.waitForTimeout(800);
  r.faixasDepoisSpc = (await J()).faixas; r.listaTexto = (await p.textContent('#jk-lista')).replace(/\s+/g, ' ').slice(0, 160);
  // exportar a faixa do jogo
  const [down] = await Promise.all([p.waitForEvent('download'), p.click('.jk-faixa >> nth=0 >> button[title="exportar .spc"]', { force: true })]);
  r.exportou = down.suggestedFilename(); const cam = saida + '/' + r.exportou; await down.saveAs(cam); r.tamSpc = require('fs').statSync(cam).size;
  // fecha a janela: continua tocando no mini-player; P volta pro jogo e a jukebox pausa
  await p.click('#jukebox [data-acao="fechar-jukebox"]'); await p.waitForTimeout(300);
  r.miniPlayer = await p.isVisible('#st-juke'); r.continuaTocando = (await J()).tocando;
  await p.keyboard.press('KeyP'); await p.waitForTimeout(400);
  r.voltouProJogo = !(await p.evaluate(() => KOFnes.pausado())); r.jukePausou = !(await J()).tocando;
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
  require('fs').writeFileSync(saida + '/ultimo-spc.txt', cam);
})();
