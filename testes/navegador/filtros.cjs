const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 820 } }); const erros = [];
  p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(16000);
  const webgl = await p.evaluate(() => KOFnes.webgl);
  for (const f of ['nitido', 'suave', 'crt', 'fliperama', 'gameboy', 'cafe', 'lcd']) {
    await p.click('#menu .m:nth-child(3) > button'); await p.click(`.sub [data-filtro="${f}"]`);
    await p.keyboard.press('KeyP'); await p.waitForTimeout(300);            // pausa: mesmo quadro em todos
    await p.locator('#tela').screenshot({ path: `${saida}/f-${f}.png` });
    await p.keyboard.press('KeyP');
  }
  console.log(JSON.stringify({ webgl, filtro: await p.evaluate(() => KOFnes.filtro()), fps: await p.textContent('#st-fps'), erros }));
  await b.close();
})();
