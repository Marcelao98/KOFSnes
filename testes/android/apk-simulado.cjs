// Simula o APK sem celular: a página é servida em https://appassets.androidplatform.net/ (como a WebView faz) e a ponte
// nativa window.KOFnesApk é um stub. Confere: abre, joga, e que os downloads (pacote de bug, .spc) passam pela ponte.
//   node testes/android/apk-simulado.cjs dist/web/KOFnes-android.html rom.sfc
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, html, rom] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  // como o MainActivity.servir(): index.html = o html; o resto (nucleos/...) vem da pasta do html (dist/web)
  await ctx.route('https://appassets.androidplatform.net/**', (rt) => {
    const nome = decodeURIComponent(new URL(rt.request().url()).pathname.slice(1)) || 'index.html';
    const arq = nome === 'index.html' ? html : require('path').join(require('path').dirname(html), nome);
    rt.fulfill(fs.existsSync(arq) ? { status: 200, contentType: nome.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(arq) } : { status: 200, contentType: 'text/plain', body: '' });
  });
  await ctx.route(/github\.com|raw\.githubusercontent/, (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  await ctx.addInitScript(() => { window.__salvos = []; window.KOFnesApk = { salvar: (n, m, b64) => window.__salvos.push([n, m, b64.length]), versao: () => 'teste' }; });
  const p = await ctx.newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('https://appassets.androidplatform.net/index.html'); await p.waitForTimeout(800);
  r.contextoSeguro = await p.evaluate(() => isSecureContext && !!crypto.subtle);
  r.modoApk = await p.evaluate(() => document.documentElement.classList.contains('celular') && !!window.KOFnesApk);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.tap('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(2500);
  r.jogando = await p.evaluate(() => KOFnes.estado().snes) && await p.isVisible('#ctl');
  const menu = async (re) => { await p.tap('#ctl [data-b="menu"]'); await p.waitForTimeout(300); const its = await p.$$('#rapido-lista li'); const nm = await Promise.all(its.map((i) => i.innerText())); const k = nm.findIndex((n) => re.test(n)); if (k >= 0) await its[k].tap(); await p.waitForTimeout(700); return k >= 0; };
  r.guardouMusica = await menu(/Guardar esta música/);
  // pacote de bug -> ponte
  await menu(/Reportar bug/); await p.fill('#bug-desc', 'teste do apk simulado');
  await Promise.all([p.waitForEvent('popup', { timeout: 6000 }).catch(() => null), p.tap('#bug [data-acao="bug-enviar"]')]); await p.waitForTimeout(1500);
  // exportar .spc da Jukebox -> ponte
  await menu(/Início/); await p.tap('#lateral [data-acao="jukebox"]'); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('#jk-lista li.jk-faixa button[title="exportar .spc"]').click()); await p.waitForTimeout(1200);
  r.salvos = await p.evaluate(() => window.__salvos.map(([n, m, t]) => `${n} (${t} chars b64)`));
  r.pacoteBug = r.salvos.some((s) => /^kofbug-.*\.json\.gz/.test(s)); r.spcExportado = r.salvos.some((s) => /\.spc/.test(s));
  r.indexedDB = await p.evaluate(async () => { const q = indexedDB.open('kofnes'); return await new Promise((ok) => { q.onsuccess = () => ok([...q.result.objectStoreNames].includes('roms')); q.onerror = () => ok(false); }); });
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
