const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(400);
  await p.click('#tela', { button: 'right', force: true }); r.semJogoNaoAbre = !(await p.evaluate(() => KOFnes.rapido()));
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  await p.click('#tela', { button: 'right' }); r.abre = await p.evaluate(() => KOFnes.rapido()); r.pausa = await p.evaluate(() => KOFnes.pausado());
  await p.click('#tela', { button: 'right', position: { x: 20, y: 20 } }); r.fechaComDireito = !(await p.evaluate(() => KOFnes.rapido()));
  await p.click('#tela', { button: 'right' }); await p.click('#tela', { position: { x: 20, y: 20 } }); r.fechaClicandoFora = !(await p.evaluate(() => KOFnes.rapido())); r.voltou = !(await p.evaluate(() => KOFnes.pausado()));
  await p.click('#tela', { button: 'right' }); await p.click('#rapido-lista li:nth-child(2)'); await p.waitForTimeout(600);
  r.itemFunciona = await p.textContent('#aviso');
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
