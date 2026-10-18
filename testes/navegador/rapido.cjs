// conforto: menu rápido, volume, proporção, tela cheia, pausa ao sair
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 760 } });
  const p = await ctx.newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await p.goto('file://' + html); await p.waitForTimeout(500);
  r.menus = await p.$$eval('#menu .m > button', (l) => l.map((x) => x.textContent));
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(2000);
  const tam = () => p.evaluate(() => KOFnes.tamTela());
  r.tam43 = await tam();
  await p.click('text=Imagem'); await p.click('[data-prop="87"]'); r.tam87 = await tam();
  await p.click('text=Imagem'); await p.click('[data-prop="esticar"]'); r.tamEsticar = await tam();
  await p.click('text=Imagem'); await p.click('[data-prop="43"]');
  // Select+Start (Shift+Enter) abre o menu rápido e pausa
  await p.keyboard.down('ShiftLeft'); await p.keyboard.down('Enter'); await p.waitForTimeout(150);
  await p.keyboard.up('Enter'); await p.keyboard.up('ShiftLeft'); await p.waitForTimeout(100);
  r.abriu = await p.evaluate(() => KOFnes.rapido()); r.pausouNoMenu = await p.evaluate(() => KOFnes.pausado());
  for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowDown");       // até Volume
  r.itemSel = await p.textContent('#rapido-lista li.sel span');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  r.volume = await p.evaluate(() => KOFnes.volume());
  r.valorMostrado = await p.textContent('#rapido-lista li.sel b');
  await p.screenshot({ path: saida + '/rapido.png' });
  for (let i = 0; i < 9; i++) await p.keyboard.press("ArrowUp");         // Salvar estado
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  r.fechouAoSalvar = !(await p.evaluate(() => KOFnes.rapido()));
  r.voltouAoJogo = !(await p.evaluate(() => KOFnes.pausado()));
  await p.keyboard.press('F6'); await p.waitForTimeout(800);
  r.cartoes = await p.locator('#grade-estados .cartao').count();
  await p.keyboard.press('Escape');
  await p.keyboard.press('F2'); r.f2abre = await p.evaluate(() => KOFnes.rapido());
  await p.keyboard.press('Escape'); r.escFecha = !(await p.evaluate(() => KOFnes.rapido()));
  await p.keyboard.press('Equal'); r.volMais = await p.evaluate(() => KOFnes.volume());
  // pausa ao sair da janela
  const vis = (h) => p.evaluate((h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await vis(true); r.pausaAoSair = await p.evaluate(() => KOFnes.pausado());
  await vis(false); r.voltaSozinho = !(await p.evaluate(() => KOFnes.pausado()));
  await p.keyboard.press('KeyP'); await vis(true); await vis(false);
  r.pausaManualFica = await p.evaluate(() => KOFnes.pausado());
  await p.keyboard.press('KeyP');
  // tela cheia (layout): força a classe se o headless não deixar
  await p.evaluate(() => document.documentElement.requestFullscreen().catch(() => {})); await p.waitForTimeout(400);
  r.fullscreenDeVerdade = await p.evaluate(() => !!document.fullscreenElement);
  if (!r.fullscreenDeVerdade) await p.evaluate(() => { document.body.classList.add('cheia'); dispatchEvent(new Event('resize')); });
  await p.waitForTimeout(200);
  r.menuEscondido = !(await p.isVisible('#menu')); r.statusEscondido = !(await p.isVisible('#status'));
  r.tamCheia = await tam(); r.viewport = await p.evaluate(() => [innerWidth, innerHeight]);
  await p.screenshot({ path: saida + '/cheia.png' });
  await p.mouse.move(500, 5); r.menuNoTopo = await p.isVisible('#menu');
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
