// cada tema: biblioteca aberta por cima do jogo + menu aberto; e as estatísticas
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 620 } });
  const p = await ctx.newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(6000);
  await p.click('#menu .m > button:text-is("Arquivo")'); await p.click('.sub [data-acao="estatisticas"]'); await p.waitForTimeout(500);
  r.estat = await p.evaluate(() => Object.values(KOFnes.estat()).map((e) => [e.nome, Math.round(e.tempo / 1000) + 's', e.sessoes]));
  r.caixas = await p.$$eval('.est-caixa b', (l) => l.map((x) => x.textContent));
  await p.screenshot({ path: saida + '/estat.png' });
  await p.keyboard.press('Escape');
  await p.click('#menu .m > button:text-is("Tema")'); await p.waitForTimeout(300);
  r.previas = await p.locator('.previa').count();
  await p.screenshot({ path: saida + '/galeria-temas.png' });
  const ids = await p.$$eval('.previa', (l) => l.map((x) => x.dataset.tema));
  await p.click('.previa[data-tema="luna"]'); r.temaClicado = await p.evaluate(() => KOFnes.tema());
  await p.keyboard.press('Escape');
  for (const t of ids) {
    await p.evaluate((t) => { document.documentElement.dataset.tema = t; }, t);
    await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(250);
    await p.screenshot({ path: `${saida}/t-${t}.png` });
    await p.keyboard.press('Escape');
  }
  await p.reload(); await p.waitForTimeout(600);
  r.temaDepoisDeRecarregar = await p.evaluate(() => KOFnes.tema());
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(600); r.info = await p.textContent('#info-det');
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
