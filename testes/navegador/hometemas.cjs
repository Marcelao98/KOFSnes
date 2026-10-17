const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage(); const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(600);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(32000);   // salvar automático guarda o print
  await p.keyboard.press('KeyP'); await p.reload(); await p.waitForTimeout(1000);
  for (const t of process.argv.slice(5)) {
    await p.evaluate((t) => { localStorage.setItem('kofnes.tema', t); }, t);
    await p.reload(); await p.waitForTimeout(900);
    await p.screenshot({ path: `${saida}/h-${t}.png` });
  }
  console.log(JSON.stringify({ erros })); await b.close();
})();
