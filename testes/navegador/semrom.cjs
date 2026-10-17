// Perfil num computador novo: o jogo aparece no Início sem a ROM. Continuar tem que pedir a pasta de ROMs.
//   node testes/navegador/semrom.cjs dist/web/KOFnes.html rom.sfc
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(400);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  await p.keyboard.press('F5'); await p.waitForTimeout(500);
  await p.evaluate(() => dispatchEvent(new Event('pagehide')));           // grava o estado automático
  await p.waitForTimeout(500);
  // "outro computador": o banco continua com o jogo e os estados, mas sem as ROMs
  await p.evaluate(() => new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => { const t = q.result.transaction('roms', 'readwrite'); t.objectStore('roms').clear(); t.oncomplete = () => { q.result.close(); ok(); }; }; }));
  await p.addInitScript(() => { window.__pasta = 0; window.showDirectoryPicker = async () => { window.__pasta++; throw new DOMException('cancelou', 'AbortError'); }; });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#hm-destaque .grande'); await p.waitForTimeout(800);       // Continuar
  r.aviso = await p.textContent('#aviso');
  r.pediuAPasta = (await p.evaluate(() => window.__pasta)) === 1;
  r.jogoNaoAbriu = (await p.evaluate(() => KOFnes.estado())).snes === false;
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
