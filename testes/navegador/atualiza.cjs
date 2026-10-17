const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext(); const p = await ctx.newPage(); const r = {}, erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  let remota = 'versao=999912312359\ntamanho=1\n';
  await ctx.route('https://raw.githubusercontent.com/**/publicado/versao.txt*', (rt) => rt.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: remota }));
  await p.goto('file://' + html); await p.waitForTimeout(600);
  r.versao = await p.evaluate(() => KOFnes.versao);
  await p.evaluate(() => localStorage.setItem('kofnes.versaoVista', '202001010000'));
  await p.reload(); await p.waitForTimeout(1600); r.avisoAtualizou = await p.textContent('#aviso');
  await p.click('#menu .m > button:text-is("Ajuda")'); await p.click('.sub [data-acao="atualizacao"]'); await p.waitForTimeout(500);
  r.temNova = await p.textContent('#aviso');
  remota = 'versao=200001010000\n';
  await p.click('#menu .m > button:text-is("Ajuda")'); await p.click('.sub [data-acao="atualizacao"]'); await p.waitForTimeout(500);
  r.jaNaMaisNova = await p.textContent('#aviso');
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
