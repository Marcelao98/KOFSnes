// KOFnes-android.html num "celular" (Chromium com toque): abre uma ROM, aperta botões com toque (inclusive vários ao mesmo tempo),
// confere o controle virtual nos 6 modelos em retrato e na horizontal, e que nenhum texto de teclado aparece.
//   node testes/android/celular.cjs /caminho/KOFnes-android.html rom.sfc saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida = '/tmp'] = process.argv;
const MODELOS = ['classico', 'moderno', 'minimo', 'arcade', 'portatil', 'tema'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route(/github\.com/, (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  const p = await ctx.newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  p.on("console", (m) => console.log("C:", m.text().slice(0, 200))); await p.goto("file://" + html); await p.waitForTimeout(800);
  r.modoCelular = await p.evaluate(() => document.documentElement.classList.contains('celular') && typeof KofS9x !== 'undefined');
  await p.screenshot({ path: saida + '/cel-inicio.png' });
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.tap('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(2500);
  r.nucleoS9x = await p.evaluate(() => !!(KOFnes.estado().snes));
  r.controleVisivel = await p.isVisible('#ctl');
  // toque: o botão A (e depois A+Direita juntos) chega no registrador do controle
  const pos = async (b) => p.evaluate((n) => { const e = document.querySelector(`#ctl [data-b="${n}"]`).getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; }, b);
  const cdp = await ctx.newCDPSession(p);
  const toques = async (pts) => cdp.send('Input.dispatchTouchEvent', { type: pts.length ? 'touchStart' : 'touchEnd', touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const move = async (pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
  const bits = () => p.evaluate(() => KOFnes.botoes());
  const [ax, ay] = await pos('A'), [bx, by] = await pos('B');
  await toques([[ax, ay]]); r.A = (await bits()) === 0x0080;
  await toques([[ax, ay], [bx, by]]); r.A_e_B_juntos = (await bits()) === (0x0080 | 0x8000);
  await toques([]); r.soltou = (await bits()) === 0;
  const [dx, dy] = await pos('dpad'), dw = await p.evaluate(() => document.querySelector('#ctl [data-b="dpad"]').getBoundingClientRect().width);
  await toques([[dx + dw * 0.4, dy]]); r.direita = (await bits()) === 0x0100;
  await move([[dx, dy - dw * 0.4]]); r.cima = (await bits()) === 0x0800;      // deslizar o dedo muda a direção
  await move([[dx + dw * 0.4, dy + dw * 0.4]]); r.diagonal = (await bits()) === 0x0500;
  await toques([]);
  // deslizar de A pra B troca o botão
  await toques([[ax, ay]]); await move([[bx, by]]); r.deslizaAparaB = (await bits()) === 0x8000; await toques([]);
  // toque longo: o app recebe "contextmenu"; só em cima da imagem do jogo abre o menu rápido, nunca nos botões
  const longo = (sel) => p.evaluate((q) => { document.querySelector(q).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return new Promise((ok) => setTimeout(() => ok(!document.getElementById('rapido').hidden), 250)); }, sel);
  r.toqueLongoNoBotaoNaoAbre = !(await longo('#ctl [data-b="A"]')) && !(await longo('#ctl [data-b="dpad"]'));
  r.toqueLongoNoJogoAbre = await longo('#tela');
  await p.evaluate(() => document.querySelector('#tela').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))); await p.waitForTimeout(300);   // fecha
  // texto de computador não pode aparecer nas telas (só o que está visível)
  const PC = /\bF\d{1,2}\b|Ctrl\+|Alt\+|Backspace|botão direito|arraste|mouse|teclado|duplo clique|setas navegam|Shift\+|Enter\b|\bEsc\b|modo sofá|Select\+/i;
  r.textoPC = {};
  await p.tap('#ctl [data-b="menu"]'); await p.waitForTimeout(300);
  r.menuAbriu = await p.isVisible('#rapido');
  r.menuTexto = await p.evaluate(() => document.querySelector('#rapido').innerText.replace(/\n+/g, ' | '));
  const itens = await p.$$('#rapido-lista li'); const nomes = await Promise.all(itens.map((i) => i.innerText()));
  const ini = nomes.findIndex((n) => /Início/.test(n)); await itens[ini].tap(); await p.waitForTimeout(500);
  for (const tela of ['home', 'biblioteca', 'jukebox', 'guia', 'teclas', 'temas']) {
    await p.tap(`#lateral [data-acao="${tela}"]`); await p.waitForTimeout(500);
    const t = await p.evaluate(() => { const v = []; for (const e of document.querySelectorAll('#palco section:not([hidden]), #palco .janela:not([hidden])')) v.push(e.innerText); return v.join('\n'); });
    const achou = t.split('\n').filter((l) => PC.test(l)); if (achou.length) r.textoPC[tela] = achou.slice(0, 4);
    await p.screenshot({ path: `${saida}/cel-tela-${tela}.png` });
  }
  await p.tap('#temas [data-acao="fechar-temas"]'); await p.waitForTimeout(300); await p.tap('#lateral [data-acao="voltar-jogo"]'); await p.waitForTimeout(600);
  r.voltouAoJogo = await p.isVisible('#ctl');
  // Jukebox: guarda a música do jogo (☰ → Guardar esta música) e toca
  const menuItem = async (re) => { await p.tap('#ctl [data-b="menu"]'); await p.waitForTimeout(300); const its = await p.$$('#rapido-lista li'); const nm = await Promise.all(its.map((i) => i.innerText())); const k = nm.findIndex((n) => re.test(n)); if (k < 0) return false; await its[k].tap(); await p.waitForTimeout(700); return true; };
  r.itemGuardarMusica = await menuItem(/Guardar esta música/);
  await menuItem(/Início/); await p.tap('#lateral [data-acao="jukebox"]'); await p.waitForTimeout(700);
  r.musicasNaJukebox = (await p.$$('#jk-lista li')).length;
  const spcTam = await p.evaluate(async () => { const db = await new Promise((ok, no) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => ok(q.result); q.onerror = no; }); const tx = db.transaction('musicas'); const todos = await new Promise((ok) => { const q = tx.objectStore('musicas').getAll(); q.onsuccess = () => ok(q.result); }); return todos.map((m) => m.spc ? m.spc.length : -1); });
  r.spcBytes = spcTam;
  await (await p.$('#jk-lista li.jk-faixa')).tap(); await p.waitForTimeout(2200);
  const j = await p.evaluate(() => KOFnes.juke()); r.jukeTocando = j.tocando && j.amostras > 20000;
  await p.tap('#lateral [data-acao="voltar-jogo"]'); await p.waitForTimeout(600);
  // caçador de bugs: abre o relatório, baixa o pacote e abre a issue do GitHub
  r.itemReportarBug = await menuItem(/Reportar bug/);
  await p.fill('#bug-desc', 'teste automático do celular');
  const [dl, pop] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.waitForEvent('popup', { timeout: 8000 }).catch(() => null), p.tap('#bug [data-acao="bug-enviar"]')]);
  r.bugPacoteBaixou = !!dl && /kofbug-.*\.json\.gz$/.test(dl.suggestedFilename());
  if (dl) { const arq = saida + '/' + dl.suggestedFilename(); await dl.saveAs(arq); r.bugPacote = arq; }
  if (pop) await pop.waitForURL(/github\.com/, { timeout: 5000 }).catch(() => {});
  r.bugIssueAbriu = !!pop && /github\.com\/Marcelao98\/KOFSnes\/issues\/new/.test(pop.url());
  await p.waitForTimeout(500);
  r.erros = erros.filter((e) => !/404/.test(e));
  for (const m of MODELOS) {
    await p.evaluate((x) => { document.querySelector('#ctl').className = 'skin-' + x; }, m);
    await p.screenshot({ path: `${saida}/cel-${m}-retrato.png` });
  }
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
  for (const m of MODELOS) {
    await p.evaluate((x) => { document.querySelector('#ctl').className = 'skin-' + x; }, m);
    await p.screenshot({ path: `${saida}/cel-${m}-horizontal.png` });
  }
  console.log(JSON.stringify(r)); await b.close();
})();
