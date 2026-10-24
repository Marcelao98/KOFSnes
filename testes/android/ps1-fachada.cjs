// PS1 nativo do APK, lado da página (sem celular): a ponte KOFnesApk é trocada por uma de mentira que responde como o
// Java (Ps1Jogo). Confere que um CD de PS1 vai pro nativo sem ser lido pelo JavaScript, que os botões e a área do jogo
// chegam a cada quadro, que pausar para o sinal, savestate pela ponte, reabrir pela biblioteca e trocar pra outro console.
//   node testes/android/ps1-fachada.cjs dist/web/KOFnes-android.html "Cubo de Teste.cue" "Cubo de Teste.bin" rom.sfc
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const [,, html, cue, bin, sfc] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://appassets.androidplatform.net/**', (rt) => {
    const nome = decodeURIComponent(new URL(rt.request().url()).pathname.slice(1)) || 'index.html';
    const arq = nome === 'index.html' ? html : path.join(path.dirname(html), nome);
    rt.fulfill(fs.existsSync(arq) ? { status: 200, contentType: nome.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(arq) } : { status: 404, body: '' });
  });
  await ctx.addInitScript(() => {
    const L = window.__ps1 = { pads: 0, areas: [], abertos: [], fechou: 0, volume: -1, estado: btoa('estado de mentira') };
    window.KOFnesApk = { salvar() {}, versao: () => 'teste', ps1Nativo: () => true,
      ps1Abrir: (n) => { L.abertos.push(n); setTimeout(() => window.__ps1Pronto({ principal: n.replace(/\.zip$/i, '.cue'), largura: 320, altura: 240, fps: 59.94, taxa: 44100 }), 50); },
      ps1Pad: (m) => { L.pads++; L.ultimoPad = m; }, ps1Area: (x, y, w, h) => L.areas.push([x, y, w, h]), ps1Fechar: () => L.fechou++,
      ps1Reiniciar() {}, ps1Volume: (v) => { L.volume = v; }, ps1Estado: () => L.estado, ps1CarregarEstado: (s) => (L.carregado = atob(s), true) };
  });
  const p = await ctx.newPage(), erros = [], falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('https://appassets.androidplatform.net/index.html'); await p.waitForTimeout(800);
  await p.setInputFiles('#arquivo', [cue, bin]); await p.waitForTimeout(2500);
  let L = await p.evaluate(() => ({ ...window.__ps1, s: KOFnes.nucleo() && { n: KOFnes.nucleo().nucleo, nativo: KOFnes.nucleo().nativo } }));
  conferir(L.s && L.s.nativo && L.abertos[0] === path.basename(cue), `o .cue foi pro PS1 nativo ${JSON.stringify(L.s)} ${L.abertos}`);
  conferir(L.pads > 60 && L.areas.length > 1 && L.areas[0][2] > 100 && L.volume >= 0, `botões a cada quadro (${L.pads}), área do jogo ${JSON.stringify(L.areas[0])}, volume ${L.volume}`);
  await p.keyboard.down('KeyX'); await p.waitForTimeout(200); L = await p.evaluate(() => window.__ps1); await p.keyboard.up('KeyX');
  conferir((L.ultimoPad & (1 << 8)) !== 0, `apertar A chega como o botão do libretro (${L.ultimoPad})`);
  // menu aberto = sem sinal
  await p.tap('#ctl [data-b="menu"]'); await p.waitForTimeout(400);
  const a1 = await p.evaluate(() => window.__ps1.pads); await p.waitForTimeout(600); const a2 = await p.evaluate(() => window.__ps1.pads);
  conferir(a2 === a1, `menu aberto: o sinal para (${a1} → ${a2}), a tela nativa some`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // savestate pela ponte
  const est = await p.evaluate(() => { const s = KOFnes.nucleo(); const u = s.serializar(); s.desserializar(u); return [u.length, window.__ps1.carregado]; });
  conferir(est[0] === 17 && est[1] === 'estado de mentira', `savestate vai e volta pela ponte ${JSON.stringify(est)}`);
  // biblioteca: reabrir pelo registro
  const reg = await p.evaluate(async () => { const q = indexedDB.open('kofnes'); const db = await new Promise((ok) => { q.onsuccess = () => ok(q.result); }); return await new Promise((ok) => { const t = db.transaction('jogos').objectStore('jogos').getAll(); t.onsuccess = () => ok(t.result.filter((j) => j.sistema === 'ps1').map((j) => j.arquivo)); }); });
  conferir(reg.includes(path.basename(cue)), `o jogo entrou na biblioteca como PS1 (${reg})`);
  // outro console: o nativo fecha
  await p.setInputFiles('#arquivo', sfc); await p.waitForTimeout(2500);
  L = await p.evaluate(() => ({ ...window.__ps1, n: KOFnes.nucleo().nucleo || 'kof' }));
  conferir(L.fechou >= 1 && L.n !== 'pcsx-nativo', `abrir um SNES fecha o PS1 nativo (fechou ${L.fechou}, agora ${L.n})`);
  conferir(erros.length === 0, 'sem erro na página ' + erros.join(' | '));
  console.log(falhas.length ? falhas.length + ' falha(s)' : 'tudo certo');
  await b.close(); process.exit(falhas.length ? 1 : 0);
})();
