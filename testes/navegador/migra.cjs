// banco antigo (v4, ROM e estado automático dentro de "jogos") -> v5
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext()).newPage(); const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file:///tmp/'); // mesma origem file://
  await p.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('kofnes', 4);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('c'); d.createObjectStore('jogos', { keyPath: 'id' }); d.createObjectStore('estados', { keyPath: 'n', autoIncrement: true }).createIndex('jogo', 'jogo'); d.createObjectStore('capas'); d.createObjectStore('stats', { keyPath: 'id' }); };
    r.onsuccess = () => { const t = r.result.transaction('jogos', 'readwrite'); t.objectStore('jogos').put({ id: 'VELHO|65536', nome: 'Jogo Velho', arquivo: 'velho.sfc', tamanho: 65536, ultimo: Date.now(), rom: new Uint8Array(65536).fill(7), auto: '{"versao":2}', autoQuando: Date.now(), autoCapa: '' }); t.oncomplete = () => { r.result.close(); ok(); }; };
  }));
  await p.goto('file://' + html); await p.waitForTimeout(1200); const res0 = await p.textContent('#hm-destaque .grande'); await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(800);
  const res = await p.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('kofnes');
    r.onsuccess = () => { const d = r.result, t = d.transaction(['jogos', 'roms', 'autos']); const o = {};
      t.objectStore('jogos').get('VELHO|65536').onsuccess = (e) => { o.jogo = { temRom: 'rom' in e.target.result, temAuto: e.target.result.temAuto }; };
      t.objectStore('roms').get('VELHO|65536').onsuccess = (e) => { o.romBytes = e.target.result && e.target.result.length; };
      t.objectStore('autos').get('VELHO|65536').onsuccess = (e) => { o.auto = e.target.result; };
      t.oncomplete = () => ok({ versao: d.version, ...o }); };
  }));
  res.inicio = res0; res.naBiblioteca = await p.textContent('#roms'); res.botao = await p.textContent('[data-acao="jogar"]');
  console.log(JSON.stringify({ ...res, erros })); await b.close();
})();
