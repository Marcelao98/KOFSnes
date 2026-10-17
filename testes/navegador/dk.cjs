const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom1, rom2] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1100, height: 780 } }); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const abre = async (rom) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]); await fc.setFiles(rom); await p.waitForTimeout(2000); };
  await abre(rom1); await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(300); await abre(rom2);
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(500);
  for (let k = 0; k < 2; k++) { await p.keyboard.press('ArrowDown'); await p.waitForTimeout(4000); }   // dá tempo de baixar
  const ver = async () => { const out = []; const n = await p.locator('#roms li').count();
    for (let k = 0; k < n; k++) await p.keyboard.press('ArrowUp');
    for (let i = 0; i < n; i++) { if (i) await p.keyboard.press('ArrowDown'); await p.waitForTimeout(2500);
      out.push((await p.textContent('#info-nome')) + ' => ' + (await p.evaluate(() => document.querySelector('#capa-img').classList.contains('oficial') ? 'CAPA OFICIAL' : 'print'))); }
    return out; };
  r.antes = await ver();
  await p.reload(); await p.waitForTimeout(1500);
  r.depoisDeRecarregar = await ver();
  r.cache = await p.evaluate(async () => { const d = await new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => ok(q.result); });
    return new Promise((ok) => { const t = d.transaction('capas').objectStore('capas'); const k = t.getAllKeys(); k.onsuccess = () => ok(k.result); }); });
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
