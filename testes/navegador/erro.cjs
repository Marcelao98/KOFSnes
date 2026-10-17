const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERRO', e.message, e.stack && e.stack.split('\n')[1]));
  p.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  await p.goto('file://' + process.argv[2]);
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => typeof KofNucleo + ' ' + typeof window.KOFnes));
  await b.close();
})();
