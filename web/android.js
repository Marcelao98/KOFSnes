// ---------------- KOFnes no celular (só entra no KOFnes-android.html) ----------------
// Vai junto do app.js, no mesmo escopo: usa o estado dele (snes, toque, voltandoTecla...) sem mudar o PC.
// Controle virtual na tela (multitoque), 6 modelos, tela "Controles" e o voltar do Android.
(() => {
  const html = document.documentElement;
  html.classList.add('celular');
  const MODELOS = [['classico', 'Clássico SNES'], ['moderno', 'Moderno'], ['minimo', 'Minimalista'], ['arcade', 'Arcade'], ['portatil', 'Portátil'], ['tema', 'Segue o tema']];
  const BITS = { A: 0x0080, B: 0x8000, X: 0x0040, Y: 0x4000, L: 0x0020, R: 0x0010, Start: 0x1000, Select: 0x2000 };
  const num = (k, p, min, max) => { const v = parseFloat(ler(k)); return isFinite(v) ? Math.min(max, Math.max(min, v)) : p; };
  const cfg = {
    modelo: MODELOS.some(([k]) => k === ler('ctlModelo')) ? ler('ctlModelo') : 'classico',
    tam: num('ctlTam', 1, 0.7, 1.4), opa: num('ctlOpa', 1, 0.25, 1), vibrar: ler('ctlVibrar') !== '0', canhoto: ler('ctlCanhoto') === '1',
  };

  // ----- montagem do controle -----
  function montarControle(raiz) {
    const el = (cls, b, txt, extra) => { const d = document.createElement('div'); d.className = 'cb ' + cls; if (b) d.dataset.b = b; if (txt) d.textContent = txt; if (extra) d.setAttribute('role', 'button'); return d; };
    const dpad = el('dpad', 'dpad'); dpad.dataset.dir = '';
    for (const c of ['h', 'v', 'u', 'd', 'l', 'r', 'k']) { const i = document.createElement('i'); i.className = c; dpad.appendChild(i); }
    raiz.append(dpad, el('shoulder', 'L', 'L'), el('shoulder', 'R', 'R'), el('pill', 'Select', 'SELECT'), el('pill', 'Start', 'START'),
      el('face', 'Y', 'Y'), el('face', 'X', 'X'), el('face', 'B', 'B'), el('face', 'A', 'A'),
      el('menu', 'menu', '☰'), el('rew', 'rew', '⏪'), el('turbo', 'turbo', '⏩'));
  }
  const ctl = document.createElement('div'); ctl.id = 'ctl'; ctl.setAttribute('aria-label', 'controle virtual');
  montarControle(ctl);
  document.body.insertBefore(ctl, $('#lateral'));
  { const lat = document.querySelector('.lat-itens'), b = document.createElement('button'); b.dataset.acao = 'teclas'; b.dataset.tela = 'teclas'; b.title = 'Controles'; b.innerHTML = '<i>🎮</i><span>Controles</span>'; lat.insertBefore(b, lat.querySelector('[data-acao="temas"]')); }
  $('#arquivo').accept = '';   // o seletor de arquivos do Android não conhece .sfc: deixa escolher qualquer arquivo

  function aplicar() {
    ctl.className = 'skin-' + cfg.modelo;
    ctl.style.setProperty('--esc', cfg.tam); ctl.style.setProperty('--opa', cfg.modelo === 'minimo' ? Math.min(cfg.opa, 0.6) : cfg.opa);
    document.body.classList.toggle('canhoto', cfg.canhoto);
    if (!(ctl.style.getPropertyValue('--opa'))) ctl.style.removeProperty('--opa');
  }
  aplicar();

  // ----- toque -----
  // cada dedo (pointerId) segura um botão; deslizar de um botão pro outro troca (dá pra "rolar" o dedo entre A, B, X e Y)
  const dedos = new Map();   // pointerId -> { b, el }
  let bitsToque = 0;
  const vibrar = () => { if (cfg.vibrar && navigator.vibrate) navigator.vibrate(8); };
  function recalcular() {
    let b = 0;
    for (const { b: nome, dir } of dedos.values()) { if (BITS[nome]) b |= BITS[nome]; if (dir) b |= dir; }
    bitsToque = b; toque = b;
  }
  function dir8(dpad, x, y) {   // posição do dedo -> bits de direção (zona morta no meio)
    const r = dpad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = (x - cx) / (r.width / 2), dy = (y - cy) / (r.height / 2), d = Math.hypot(dx, dy);
    const mx = Math.max(-1, Math.min(1, dx)), my = Math.max(-1, Math.min(1, dy));
    dpad.style.setProperty('--kx', d > 1 ? dx / d : mx); dpad.style.setProperty('--ky', d > 1 ? dy / d : my);
    let bits = 0, nome = '';
    if (d > 0.22) {
      if (dx < -0.38) { bits |= 0x0200; nome += 'l '; } if (dx > 0.38) { bits |= 0x0100; nome += 'r '; }
      if (dy < -0.38) { bits |= 0x0800; nome += 'u '; } if (dy > 0.38) { bits |= 0x0400; nome += 'd '; }
    }
    dpad.dataset.dir = nome.trim();
    return bits;
  }
  const alvoSob = (x, y) => { const e = document.elementFromPoint(x, y); const c = e && e.closest('#ctl .cb'); return c; };
  function soltar(id) {
    const f = dedos.get(id); if (!f) return;
    f.el.classList.remove('on');
    if (f.b === 'dpad') { f.el.dataset.dir = ''; f.el.style.setProperty('--kx', 0); f.el.style.setProperty('--ky', 0); }
    if (f.b === 'rew') voltandoTecla = false;
    if (f.b === 'turbo') turbo = false;
    dedos.delete(id); recalcular();
  }
  function apertar(id, c, x, y) {
    const b = c.dataset.b, f = { b, el: c, dir: 0 };
    dedos.set(id, f); c.classList.add('on'); vibrar();
    if (b === 'dpad') f.dir = dir8(c, x, y);
    if (b === 'rew') voltandoTecla = true;
    if (b === 'turbo') turbo = true;
    if (b === 'menu') { dedos.delete(id); c.classList.remove('on'); if (snes && !rapidoAberto) abrirRapido(); else if (rapidoAberto) fecharRapido(); return; }
    recalcular();
  }
  ctl.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cb'); if (!c) return;
    e.preventDefault(); try { ctl.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
    apertar(e.pointerId, c, e.clientX, e.clientY);
  });
  ctl.addEventListener('pointermove', (e) => {
    const f = dedos.get(e.pointerId); if (!f) return;
    if (f.b === 'dpad') { f.dir = dir8(f.el, e.clientX, e.clientY); recalcular(); return; }
    const c = alvoSob(e.clientX, e.clientY);
    if (c && c !== f.el && c.dataset.b !== 'dpad' && c.dataset.b !== 'menu') { soltar(e.pointerId); apertar(e.pointerId, c, e.clientX, e.clientY); }
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) ctl.addEventListener(t, (e) => soltar(e.pointerId));
  ctl.addEventListener('contextmenu', (e) => e.preventDefault());
  // saiu do app / abriu uma tela: solta tudo (senão o botão fica "preso")
  const soltarTudo = () => { for (const id of [...dedos.keys()]) soltar(id); toque = 0; };
  addEventListener('blur', soltarTudo); document.addEventListener('visibilitychange', () => { if (document.hidden) soltarTudo(); });

  // ----- quando o controle aparece -----
  let jogando = false;
  function atualizarJogando() {
    const j = !!snes && telaAtual() === 'jogo';
    if (j === jogando) return;
    jogando = j; document.body.classList.toggle('cel-jogo', j);
    if (!j) soltarTudo();
    requestAnimationFrame(() => ajustarEscala());
  }
  setInterval(atualizarJogando, 200);
  addEventListener('resize', () => requestAnimationFrame(() => ajustarEscala()));
  addEventListener('orientationchange', () => setTimeout(() => ajustarEscala(), 250));

  // ----- menu rápido: o que faz sentido no celular -----
  ITENS_RAPIDO.splice(1, 0, { t: '🏠 Início', f: () => { fecharRapido(); acao('home'); } }, { t: '🎮 Controle virtual', f: () => { fecharRapido(); acao('teclas'); } });

  // ----- tela Controles (reaproveita a janela de teclas, que não serve no celular) -----
  const janela = $('#teclas');
  janela.querySelector('.titulo-j').firstChild.textContent = '🎮 Controles ';
  $('#teclas-dica').textContent = 'Escolha o modelo do controle e ajuste do seu jeito.';
  // miniatura de cada modelo: um desenho simples (cruz ou joystick, 4 botões, ombros) nas cores dele
  const PREV = {
    classico: { bg: '#c9c9d1', dp: '#3b3b45', ombro: '#6d6d78', f: { X: '#3a6fd3', Y: '#3aa05a', A: '#d33a3a', B: '#e0b020' }, forma: 'cruz' },
    moderno: { bg: '#14161c', dp: '#ffffff33', ombro: '#2a2d38', f: { X: '#ffd24a', Y: '#4aa8ff', A: '#ff5a5a', B: '#4cd16b' }, forma: 'stick', anel: true },
    minimo: { bg: '#1a110b', dp: 'none', ombro: 'none', f: { X: 'none', Y: 'none', A: 'none', B: 'none' }, forma: 'cruz', contorno: '#f3e5d0' },
    arcade: { bg: '#1a1020', dp: '#d01c1c', ombro: '#3a2a48', f: { X: '#3a8be0', Y: '#e8d23a', A: '#38c060', B: '#e0383a' }, forma: 'stick', arcade: true },
    portatil: { bg: '#b9bda6', dp: '#2a2c26', ombro: '#4a4e3e', f: { X: '#4a4e3e', Y: '#4a4e3e', A: '#8d1f4a', B: '#8d1f4a' }, forma: 'cruz', diag: true },
    tema: { bg: 'var(--painel)', dp: 'var(--painel2)', ombro: 'var(--painel2)', f: { X: 'var(--painel2)', Y: 'var(--painel2)', A: 'var(--destaque)', B: 'var(--destaque)' }, forma: 'cruz', contorno: 'var(--borda)' },
  };
  function desenho(id) {
    const m = PREV[id], c = m.contorno ? `stroke="${m.contorno}" stroke-width="1.4"` : '';
    const pos = m.diag ? { X: [92, 20], Y: [82, 30], A: [104, 30], B: [92, 40] } : m.arcade ? { X: [96, 20], Y: [84, 24], A: [102, 40], B: [88, 42] } : { X: [96, 18], Y: [84, 30], A: [108, 30], B: [96, 42] };
    const dp = m.forma === 'cruz'
      ? `<path d="M22 17h8v10h10v8H30v10h-8V35H12v-8h10z" fill="${m.dp}" ${c}/>`
      : `<circle cx="26" cy="31" r="14" fill="${m.anel ? '#ffffff14' : '#2c2236'}" ${m.anel ? 'stroke="#ffffff55" stroke-width="1.4"' : ''}/><circle cx="26" cy="31" r="7" fill="${m.arcade ? '#d01c1c' : '#ffffffcc'}"/>`;
    const fs = Object.entries(pos).map(([k, [x, y]]) => `<circle cx="${x}" cy="${y}" r="${m.diag && (k === 'X' || k === 'Y') ? 5 : 7}" fill="${m.f[k]}" ${c}/>`).join('');
    const om = `<rect x="4" y="3" width="24" height="7" rx="3" fill="${m.ombro}" ${c}/><rect x="92" y="3" width="24" height="7" rx="3" fill="${m.ombro}" ${c}/>`;
    return `<svg viewBox="0 0 120 56" aria-hidden="true"><rect width="120" height="56" fill="${m.bg}"/>${om}${dp}${fs}</svg>`;
  }
  function previa(m) {
    const card = document.createElement('button'); card.className = 'ctl-card' + (cfg.modelo === m[0] ? ' ativo' : ''); card.dataset.modelo = m[0];
    card.innerHTML = desenho(m[0]); const b = document.createElement('b'); b.textContent = m[1]; card.appendChild(b); return card;
  }
  function slider(rotulo, k, min, max, passo, valor, fmt) {
    const l = document.createElement('label'), s = document.createElement('input'), v = document.createElement('span');
    s.type = 'range'; s.min = min; s.max = max; s.step = passo; s.value = valor; v.textContent = fmt(valor);
    s.addEventListener('input', () => { cfg[k] = parseFloat(s.value); v.textContent = fmt(cfg[k]); guardar(k === 'tam' ? 'ctlTam' : 'ctlOpa', String(cfg[k])); aplicar(); });
    const t = document.createElement('span'); t.textContent = rotulo; l.append(t, s, v); return l;
  }
  function chave(rotulo, k, chaveLs, aoMudar) {
    const l = document.createElement('label'), c = document.createElement('input'), t = document.createElement('span');
    c.type = 'checkbox'; c.checked = !!cfg[k]; t.textContent = rotulo;
    c.addEventListener('change', () => { cfg[k] = c.checked; guardar(chaveLs, k === 'vibrar' ? (c.checked ? '1' : '0') : (c.checked ? '1' : '0')); aplicar(); if (aoMudar) aoMudar(); });
    l.append(t, c); return l;
  }
  montarGrade = function () {
    const g = $('#grade-teclas'); g.innerHTML = ''; g.style.display = 'block';
    const lista = document.createElement('div'); lista.className = 'ctl-lista';
    for (const m of MODELOS) lista.appendChild(previa(m));
    lista.addEventListener('click', (e) => { const c = e.target.closest('[data-modelo]'); if (!c) return; cfg.modelo = c.dataset.modelo; guardar('ctlModelo', cfg.modelo); aplicar(); montarGrade(); });
    const aj = document.createElement('div'); aj.className = 'ctl-ajustes';
    aj.append(slider('Tamanho', 'tam', 0.7, 1.4, 0.05, cfg.tam, (v) => Math.round(v * 100) + '%'), slider('Transparência', 'opa', 0.25, 1, 0.05, cfg.opa, (v) => Math.round(v * 100) + '%'),
      chave('Vibrar ao tocar', 'vibrar', 'ctlVibrar'), chave('Modo canhoto (troca os lados)', 'canhoto', 'ctlCanhoto'));
    g.append(lista, aj);
  };
  montarAjuda = function () { /* a tabela de atalhos de teclado não existe no celular */ };
  { const rp = janela.querySelector('[data-acao="teclas-padrao"]') || [...janela.querySelectorAll('button')].find((b) => /Restaurar/.test(b.textContent));
    if (rp) { rp.dataset.acao = 'ctl-padrao'; rp.addEventListener('click', () => { Object.assign(cfg, { modelo: 'classico', tam: 1, opa: 1, vibrar: true, canhoto: false }); for (const k of ['ctlModelo', 'ctlTam', 'ctlOpa', 'ctlVibrar', 'ctlCanhoto']) guardar(k, ''); aplicar(); montarGrade(); avisar('controle: padrão'); }); } }
  janela.style.width = 'min(560px, 100vw)'; janela.style.maxHeight = '100%'; janela.style.overflowY = 'auto';

  // ----- voltar do Android: no jogo abre o menu rápido; nas telas, volta -----
  history.pushState({ kofnes: 1 }, '');
  addEventListener('popstate', () => {
    history.pushState({ kofnes: 1 }, '');
    if (rapidoAberto) { fecharRapido(); return; }
    if (snes && telaAtual() === 'jogo') { abrirRapido(); return; }
    acao('voltar');
  });

  // ----- textos que só fazem sentido no computador -----
  const guia = $('#guia');
  if (guia) {
    const nav = guia.querySelector('nav'), conteudo = guia.querySelectorAll('[data-pagina]');
    const paginas = {
      comecar: ['👋 Começando', '<h3>👋 Começando</h3><p>O <b>KOFnes</b> é um emulador de Super Nintendo. Toque em <b>Abrir uma ROM</b>, escolha o arquivo do seu jogo e jogue com o controle na tela.</p><p>Este guia tem o resto: biblioteca, controle, voltar no tempo, imagem e som, jukebox e temas.</p>'],
      biblioteca: ['📚 Biblioteca', '<h3>📚 Biblioteca</h3><p>Toque em <b>Abrir uma ROM</b> e escolha o arquivo do jogo (.sfc, .smc ou .zip). Ele fica guardado na <b>Biblioteca</b>: da próxima vez é só tocar nele.</p><p>No <b>Início</b>, <b>Continuar</b> volta exatamente de onde você parou.</p>'],
      jogando: ['🎮 Jogando', '<h3>🎮 Jogando</h3><p>O controle fica na tela. Dá pra apertar vários botões ao mesmo tempo e deslizar o dedo entre A, B, X e Y.</p><p>Toque em <b>☰</b> pra salvar, carregar, mudar o tema e o filtro. Em <b>Controles</b> (barra de baixo) você troca o modelo do controle, o tamanho e a transparência, e liga o modo canhoto.</p><p>Gire o celular: na horizontal, os botões ficam nos cantos e o jogo ganha a tela.</p>'],
      bugs: ['🐞 Bugs', '<h3>🐞 Bugs</h3><p>O KOFnes é jovem, e cada bug encontrado ajuda o emulador. Toque em <b>☰</b> e em <b>Reportar bug</b>: a página do GitHub abre já preenchida e um pacote é baixado pra reproduzir o bug quadro a quadro. É só anexar o arquivo na página.</p><p>Se o emulador quebrar, ele mesmo oferece reportar.</p>'],
      tempo: ['⏪ Voltar no tempo', '<h3>⏪ Voltar no tempo</h3><p>Segure o <b>⏪</b> e o jogo volta até 5 segundos, em preto e branco. Soltou, continua dali. Depois a ampulheta ⏳ recarrega enquanto você joga.</p><p><b>⏩</b> acelera o jogo enquanto você segura.</p>'],
      imagem: ['🖼 Imagem e som', '<h3>🖼 Imagem e som</h3><p>No <b>☰</b>: filtro (tela de tubo, LCD, Game Boy…), proporção, moldura e volume. O som precisa estar ligado no aparelho.</p>'],
      jukebox: ['🎵 Jukebox', '<h3>🎵 Jukebox</h3><p>No meio do jogo, toque em <b>☰</b> e em <b>Guardar esta música</b>: a trilha que está tocando vai pra Jukebox, e você ouve depois, sem o jogo. Também dá pra abrir arquivos <b>.spc</b>.</p><p>As 8 vozes do chip de som aparecem ao vivo: toque numa pra silenciar e ouvir só o baixo ou a percussão.</p>'],
      temas: ['🎨 Temas', '<h3>🎨 Temas</h3><p>São <span class="n-temas">126</span> temas, com busca e categorias. Toque em <b>Tema</b> na barra de baixo. O modelo de controle <b>Segue o tema</b> usa as cores do tema escolhido.</p>'],
    };
    nav.innerHTML = Object.entries(paginas).map(([k, [rot]]) => `<button data-guia="${k}">${rot}</button>`).join('');
    const pai = conteudo[0].parentNode; conteudo.forEach((c) => c.remove());
    for (const [k, [, corpo]] of Object.entries(paginas)) { const d = document.createElement('div'); d.dataset.pagina = k; d.hidden = k !== 'comecar'; d.innerHTML = corpo; pai.appendChild(d); }
    nav.firstElementChild.classList.add('ativo');
  }
  // dentro do app (APK) o arquivo já está no aparelho; no navegador, instalável (PWA) só quando servido por http(s)
  if (!window.KOFnesApk && /^https?:/.test(location.protocol) && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // APK: a WebView não baixa arquivo de link "blob:"; a ponte nativa abre o "salvar como" do Android
  if (window.KOFnesApk) {
    document.addEventListener('click', async (e) => {
      const a = e.target.closest && e.target.closest('a[download]');
      if (!a || !a.href.startsWith('blob:')) return;
      e.preventDefault(); e.stopPropagation();
      try {
        const blob = await (await fetch(a.href)).blob(), u8 = new Uint8Array(await blob.arrayBuffer());
        KOFnesApk.salvar(a.download || 'kofnes.bin', blob.type || 'application/octet-stream', b64(u8));
      } catch (x) { avisar('não consegui salvar o arquivo: ' + x.message, 4000); }
    }, true);
  }
  document.querySelectorAll('.n-temas').forEach((e) => { e.textContent = TODOS_TEMAS.length; });
})();
