// Interface do KOFnes no navegador. O emulador em si é o núcleo Kof
// (snes/), compilado pra JavaScript: KofNucleo.Snes. Aqui fica só o que
// é de "janela": tela, som, teclado/controle, ROMs, saves e temas.
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const QUADRO_MS = 1000 / 60.0988;
const guardar = (k, v) => { try { localStorage.setItem('kofnes.' + k, v); } catch (e) { /* sem armazenamento */ } };
const ler = (k) => { try { return localStorage.getItem('kofnes.' + k); } catch (e) { return null; } };

let snes = null, romNome = '', pausado = false, mudo = ler('mudo') === '1';
let escala = +(ler('escala') || 0), chaveSram = '', sramAntes = '';

// ---------------- tela ----------------
// O quadro do núcleo vai pra uma textura 256x224 e a placa de vídeo (WebGL)
// desenha com o filtro escolhido. Sem WebGL, volta pro canvas 2D (só nítido).
const FILTROS = [
  ['nitido', 'Nítido'], ['suave', 'Suave'], ['crt', 'TV de tubo (CRT)'], ['fliperama', 'Fliperama'],
  ['gameboy', 'Game Boy'], ['cafe', 'Café (sépia)'], ['lcd', 'Tela LCD'],
];
const tela = $('#tela');
const img = new ImageData(256, 224), px = new Uint32Array(img.data.buffer);
let filtro = ler('filtro') || 'nitido';
const gl = tela.getContext('webgl', { alpha: false, antialias: false });
const ctx = gl ? null : tela.getContext('2d', { alpha: false });
let glModo = null, glTex = null, glTam = null, glSaida = null;
if (gl) {
  const sombra = (tipo, fonte) => { const s = gl.createShader(tipo); gl.shaderSource(s, fonte); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sombra(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 uv;
    void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`));
  gl.attachShader(prog, sombra(gl.FRAGMENT_SHADER, `precision mediump float;
    uniform sampler2D t; uniform vec2 tam; uniform vec2 saida; uniform int modo; varying vec2 uv;
    vec2 curva(vec2 q) { q = q * 2. - 1.; vec2 o = abs(q.yx) / vec2(6., 4.5); q += q * o * o; return q * .5 + .5; }
    float luz(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
    void main() {
      vec2 c = uv;
      if (modo == 2) { c = curva(uv); if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; } }
      vec3 col = texture2D(t, c).rgb;
      if (modo == 2 || modo == 3) {
        float s = .5 + .5 * cos(6.28318 * (c.y * tam.y - .5));      // linhas de varredura
        col *= 1. - (modo == 2 ? .35 : .6) * (1. - s);
        if (modo == 2) {
          vec2 d = vec2(1. / tam.x, 0.);
          col += (texture2D(t, c + d).rgb + texture2D(t, c - d).rgb) * .07;   // brilho do fósforo
          float m = mod(gl_FragCoord.x, 3.);                                  // máscara RGB
          col *= (m < 1. ? vec3(1., .82, .82) : m < 2. ? vec3(.82, 1., .82) : vec3(.82, .82, 1.)) * 1.18;
          vec2 v = c * (1. - c.yx); col *= pow(clamp(v.x * v.y * 15., 0., 1.), .25);   // vinheta
        } else col *= 1.3;
      }
      if (modo == 4) {
        float l = luz(col);
        col = l < .25 ? vec3(.06, .22, .06) : l < .5 ? vec3(.19, .38, .19) : l < .75 ? vec3(.55, .67, .06) : vec3(.61, .74, .06);
      }
      if (modo == 5) {
        col = mix(col, vec3(luz(col)) * vec3(1.08, .86, .62), .78);
        vec2 v = uv * (1. - uv.yx); col *= pow(clamp(v.x * v.y * 16., 0., 1.), .22);
      }
      if (modo == 6) { vec2 f = fract(c * tam); col *= (.5 + .5 * step(.1, f.x) * step(.1, f.y)) * 1.12; }
      gl_FragColor = vec4(col, 1.);
    }`));
  gl.linkProgram(prog); gl.useProgram(prog);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
  glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 224, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  glModo = gl.getUniformLocation(prog, 'modo'); glTam = gl.getUniformLocation(prog, 'tam'); glSaida = gl.getUniformLocation(prog, 'saida');
  gl.uniform2f(glTam, 256, 224);
}
const bytesTela = new Uint8Array(img.data.buffer);
function pintar() {
  if (!gl) { ctx.putImageData(img, 0, 0); return; }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 224, gl.RGBA, gl.UNSIGNED_BYTE, bytesTela);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function aplicarFiltro(nome) {
  filtro = FILTROS.some(([k]) => k === nome) ? nome : 'nitido';
  guardar('filtro', filtro);
  document.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('ativo', b.dataset.filtro === filtro));
  if (!gl) return;
  const n = FILTROS.findIndex(([k]) => k === filtro);
  gl.uniform1i(glModo, n);
  const suave = ['suave', 'crt', 'fliperama', 'cafe'].includes(filtro) ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, suave); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, suave);
  pintar();
}
function desenhar() {
  const f = snes.ppu.frame;
  // o núcleo entrega 0xAARRGGBB; a textura (little-endian) quer 0xAABBGGRR
  for (let i = 0; i < 57344; i++) {
    const c = f[i];
    px[i] = 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
  }
  pintar();
}
// proporção: 4:3 é como aparecia na TV (o pixel do SNES não é quadrado);
// 8:7 é o pixel quadrado (256x224); esticar ocupa o palco inteiro
const PROPORCOES = [['43', '4:3 (como na TV)'], ['87', 'Pixel perfeito (8:7)'], ['esticar', 'Esticar']];
const RAZAO = { 43: 4 / 3, 87: 8 / 7 };
let proporcao = PROPORCOES.some(([k]) => k === ler('proporcao')) ? ler('proporcao') : '43';
// moldura em volta do jogo; as bordas são frações da altura da tela (cima, direita, baixo, esquerda)
const MOLDURAS = [['nenhuma', 'Sem moldura'], ['tv80', 'TV de madeira (anos 80)'], ['tv90', 'TV de tubo (anos 90)'], ['fliperama', 'Fliperama']];
const BORDAS = { nenhuma: [0, 0, 0, 0], tv80: [0.1, 0.44, 0.1, 0.1], tv90: [0.08, 0.08, 0.2, 0.08], fliperama: [0.3, 0.12, 0.34, 0.12] };
let moldura = BORDAS[ler('moldura')] ? ler('moldura') : 'nenhuma';
function mudarMoldura(v) { moldura = BORDAS[v] ? v : 'nenhuma'; guardar('moldura', moldura); ajustarEscala(); }
function ajustarEscala() {
  const p = $('#palco'), cheia = document.body.classList.contains('cheia'), folga = cheia ? 0 : 16;
  const W = Math.max(256, p.clientWidth - folga), H = Math.max(224, p.clientHeight - folga);
  const [bc, bd, bb, be] = BORDAS[moldura], comMoldura = moldura !== 'nenhuma';
  let w, h;
  if (proporcao === 'esticar') { h = H / (1 + bc + bb); w = W - (bd + be) * h; } else {
    const r = RAZAO[proporcao], hMax = Math.min(H / (1 + bc + bb), W / (r + bd + be));
    if (cheia || comMoldura) h = hMax;                         // tela cheia ou moldura: o maior que couber
    else {
      const maxE = Math.max(1, Math.floor(hMax / 224));
      h = 224 * (escala ? Math.min(escala, maxE) : maxE);       // na janela: múltiplo inteiro
    }
    w = h * r;
  }
  w = Math.floor(w); h = Math.floor(h);
  tela.style.width = w + 'px'; tela.style.height = h + 'px';
  const m = $('#moldura');
  document.body.dataset.moldura = moldura;
  m.style.padding = [bc, bd, bb, be].map((f) => Math.round(f * h) + 'px').join(' ');
  m.style.setProperty('--h', h + 'px');
  if (gl) {   // o canvas WebGL desenha na resolução da tela, pros filtros terem detalhe
    const dpr = window.devicePixelRatio || 1;
    tela.width = Math.round(w * dpr); tela.height = Math.round(h * dpr);
    gl.viewport(0, 0, tela.width, tela.height); gl.uniform2f(glSaida, tela.width, tela.height); pintar();
  } else { tela.width = 256; tela.height = 224; }
  document.querySelectorAll('[data-escala]').forEach((b) => b.classList.toggle('ativo', +b.dataset.escala === escala));
  document.querySelectorAll('[data-prop]').forEach((b) => b.classList.toggle('ativo', b.dataset.prop === proporcao));
  document.querySelectorAll('[data-moldura]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('ativo', b.dataset.moldura === moldura); });
}
function mudarProporcao(v) {
  proporcao = PROPORCOES.some(([k]) => k === v) ? v : '43'; guardar('proporcao', proporcao); ajustarEscala();
}
addEventListener('resize', ajustarEscala);
// tela cheia de verdade: some menu e barra; o cursor some parado; encostar no topo mostra o menu
let cursorT = 0;
addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('cheia', !!document.fullscreenElement);
  document.body.classList.remove('mostrar-menu', 'cursor-oculto');
  ajustarEscala();
});
addEventListener('mousemove', (e) => {
  const b = document.body;
  b.classList.remove('cursor-oculto'); clearTimeout(cursorT);
  if (!b.classList.contains('cheia')) return;
  cursorT = setTimeout(() => b.classList.add('cursor-oculto'), 2000);
  if (e.clientY < 24) b.classList.add('mostrar-menu');
  else if (!e.target.closest('#menu')) { b.classList.remove('mostrar-menu'); fecharMenus(); }
});
tela.addEventListener('dblclick', () => acao('cheia'));

// ---------------- som ----------------
// fila circular de amostras (estéreo intercalado), tocada por um
// ScriptProcessor; se o navegador não abrir a 32 kHz, reamostra
let audio = null, no = null, taxa = 1;
const FILA = 1 << 15, fila = new Float32Array(FILA * 2);
let ini = 0, fim = 0;
function ligarSom() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  try {
    try { audio = new AudioContext({ sampleRate: 32000 }); } catch (e) { audio = new AudioContext(); }
    taxa = 32000 / audio.sampleRate;
    no = audio.createScriptProcessor(2048, 0, 2);
    let pos = 0;
    no.onaudioprocess = (ev) => {
      const l = ev.outputBuffer.getChannelData(0), r = ev.outputBuffer.getChannelData(1);
      for (let i = 0; i < l.length; i++) {
        if (ini === fim || mudo || pausado) { l[i] = r[i] = 0; continue; }
        l[i] = fila[ini * 2]; r[i] = fila[ini * 2 + 1];
        pos += taxa;
        while (pos >= 1 && ini !== fim) { pos -= 1; ini = (ini + 1) & (FILA - 1); }
      }
    };
    ganho = audio.createGain(); ganho.gain.value = volume / 100;
    no.connect(ganho); ganho.connect(audio.destination);
  } catch (e) { audio = null; }
}
// volume de 0 a 100%, de 10 em 10 (teclas - e =, menu Som, menu rápido)
let ganho = null, volume = Math.max(0, Math.min(100, +(ler('volume') || 100)));
function mudarVolume(d) {
  volume = Math.max(0, Math.min(100, Math.round((volume + d) / 10) * 10)); guardar('volume', volume);
  if (ganho) ganho.gain.value = volume / 100;
  if (d > 0 && mudo) { mudo = false; guardar('mudo', '0'); }
  marcarSom(); avisar((volume ? '🔊 ' : '🔇 ') + volume + '%');
}
function marcarSom() {
  $('#vol-valor').textContent = mudo ? 'mudo' : volume + '%';
  $('[data-acao="mudo"]').classList.toggle('ativo', mudo);
  const pa = $('[data-acao="pausa-auto"]');
  pa.textContent = 'Pausar ao sair da janela: ' + (pausaAuto ? 'ligado' : 'desligado'); pa.classList.toggle('ativo', pausaAuto);
  if (rapidoAberto) montarRapido();
}
function empurrarSom() {
  const d = snes.apu.dsp, n = d.outCount, b = d.outBuf;
  const cheio = ((fim - ini) & (FILA - 1)) > 32000 * 0.15; // > 150 ms: descarta
  if (audio && !cheio) {
    for (let i = 0; i + 1 < n; i += 2) {
      fila[fim * 2] = b[i] / 32768; fila[fim * 2 + 1] = b[i + 1] / 32768;
      fim = (fim + 1) & (FILA - 1);
    }
  }
  d.outCount = 0;
}

// ---------------- controles ----------------
// botões do SNES: nome, bit no registrador do controle e tecla padrão
const BOTOES_SNES = [
  ['Cima', 0x0800, 'ArrowUp'], ['Baixo', 0x0400, 'ArrowDown'],
  ['Esquerda', 0x0200, 'ArrowLeft'], ['Direita', 0x0100, 'ArrowRight'],
  ['B', 0x8000, 'KeyZ'], ['A', 0x0080, 'KeyX'], ['Y', 0x4000, 'KeyA'], ['X', 0x0040, 'KeyS'],
  ['L', 0x0020, 'KeyQ'], ['R', 0x0010, 'KeyW'], ['Start', 0x1000, 'Enter'], ['Select', 0x2000, 'ShiftLeft'],
];
// atalhos do emulador: não podem virar botão do jogo
const RESERVADAS = ['Escape', 'Tab', 'Backspace', 'F9', 'F1', 'F2', 'F5', 'F6', 'F8', 'F11', 'KeyP', 'KeyM', 'Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd'];
let mapa = {};   // nome do botão -> código da tecla (KeyboardEvent.code)
let TECLAS = {}; // código da tecla -> bit
function carregarMapa() {
  let salvo = null;
  try { salvo = JSON.parse(ler('teclas') || 'null'); } catch (e) { salvo = null; }
  mapa = {};
  for (const [nome, , padrao] of BOTOES_SNES) mapa[nome] = (salvo && salvo[nome]) || padrao;
  montarTeclas();
}
function montarTeclas() {
  TECLAS = {};
  for (const [nome, bit] of BOTOES_SNES) if (mapa[nome]) TECLAS[mapa[nome]] = bit;
}
function nomeTecla(c) {
  if (!c) return '—';
  const setas = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (setas[c]) return setas[c];
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad/.test(c)) return 'Num ' + c.slice(6);
  const nomes = { Space: 'Espaço', ShiftLeft: 'Shift esq.', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl esq.',
    ControlRight: 'Ctrl dir.', AltLeft: 'Alt', AltRight: 'AltGr', Backspace: 'Backspace', Enter: 'Enter',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
    Minus: '-', Equal: '=', Backslash: '\\', IntlBackslash: '\\' };
  return nomes[c] || c;
}
// janela "Configurar teclas": clica num botão, aperta a tecla
let capturando = null;
function montarGrade() {
  const g = $('#grade-teclas'); g.innerHTML = '';
  for (const [nome] of BOTOES_SNES) {
    const linha = document.createElement('div'); linha.className = 'linha-tecla';
    const rot = document.createElement('span'); rot.textContent = nome;
    const b = document.createElement('button');
    b.className = 'tecla' + (capturando === nome ? ' esperando' : '');
    b.textContent = capturando === nome ? 'aperte uma tecla…' : nomeTecla(mapa[nome]);
    b.onclick = (e) => { e.stopPropagation(); capturando = nome; montarGrade(); };
    linha.append(rot, b); g.appendChild(linha);
  }
  $('#teclas-dica').textContent = capturando
    ? `Aperte a tecla para ${capturando} (Esc cancela).`
    : 'Clique num botão e aperte a tecla que quiser.';
}
function capturar(e) {
  e.preventDefault();
  if (e.code === 'Escape') { capturando = null; montarGrade(); return; }
  if (RESERVADAS.includes(e.code)) { avisar(nomeTecla(e.code) + ' é atalho do emulador; escolha outra', 2500); return; }
  // se a tecla já era de outro botão, os dois trocam
  const dono = Object.keys(mapa).find((n) => mapa[n] === e.code && n !== capturando);
  if (dono) mapa[dono] = mapa[capturando];
  mapa[capturando] = e.code;
  capturando = null; teclado = 0;
  guardar('teclas', JSON.stringify(mapa)); montarTeclas(); montarGrade(); montarAjuda();
}
function montarAjuda() {
  const t = (n) => nomeTecla(mapa[n]);
  const linhas = [
    ['Direcional', `${t('Cima')} ${t('Baixo')} ${t('Esquerda')} ${t('Direita')}`, 'Abrir ROM', 'Ctrl+O'],
    ['B · A', `${t('B')} · ${t('A')}`, 'Lista de ROMs', 'Ctrl+L'],
    ['Y · X', `${t('Y')} · ${t('X')}`, 'Pausa', 'P / Esc'],
    ['L · R', `${t('L')} · ${t('R')}`, 'Reiniciar', 'F1'],
    ['Start · Select', `${t('Start')} · ${t('Select')}`, 'Turbo', 'Tab (segurar)'],
    ['Controle USB/Xbox', 'também funciona', 'Tela cheia', 'F11 · duplo clique'],
    ['Menu rápido', 'Select+Start · F2', 'Volume', '- / ='],
    ['Salvar · carregar', 'Select+L · Select+R', 'Sair da tela cheia', 'Esc'],
    ['Rebobinar (segurar)', 'Select+Y', 'Rebobinar (segurar)', 'Backspace'],
    ['', '', 'Reportar bug', 'F9'],
  ];
  const tab = $('#tab-ajuda');
  tab.innerHTML = '<tr><th>SNES</th><th>Teclado</th><th>Emulador</th><th>Teclado</th></tr>';
  for (const l of linhas) {
    const tr = document.createElement('tr');
    for (const c of l) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }
    tab.appendChild(tr);
  }
}
// controle "standard" (Xbox/USB): A,B,X,Y na posição do SNES
const BOTOES = [[0, 0x8000], [1, 0x0080], [2, 0x4000], [3, 0x0040], [4, 0x0020], [5, 0x0010],
  [8, 0x2000], [9, 0x1000], [12, 0x0800], [13, 0x0400], [14, 0x0200], [15, 0x0100]];
let teclado = 0, turbo = false;
function estado() {
  let b = teclado;
  for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (!g) continue;
    for (const [i, bit] of BOTOES) if (g.buttons[i] && g.buttons[i].pressed) b |= bit;
    if (g.axes[0] < -0.5) b |= 0x0200; if (g.axes[0] > 0.5) b |= 0x0100;
    if (g.axes[1] < -0.5) b |= 0x0800; if (g.axes[1] > 0.5) b |= 0x0400;
  }
  if ((b & 0x0C00) === 0x0C00) b &= ~0x0C00; // cima+baixo não existe no SNES
  if ((b & 0x0300) === 0x0300) b &= ~0x0300;
  return b;
}
// Select + Start/L/R é atalho do emulador: enquanto apertados juntos, não chegam ao jogo
function semCombo(b) {
  return (b & 0x2000) && (b & 0x5030) ? b & ~0x7030 : b;
}
addEventListener('keydown', (e) => {
  ligarSom();
  if (capturando) { capturar(e); return; }
  if (!$('#bug').hidden) { if (e.code === 'Escape') fecharBug(); return; }   // digitando a descrição
  if (rapidoAberto) { rapidoTecla(e); return; }
  if (e.code === 'F9') { e.preventDefault(); abrirBug(); return; }
  if (!$('#temas').hidden) {
    if (e.code === 'Escape') { acao('fechar-temas'); return; }
    if (temasTecla(e)) return;
    if (e.code === 'Enter' || e.code === 'Space') return;   // o botão em foco recebe o clique
  }
  if (e.code === 'F2') { e.preventDefault(); acao('rapido'); return; }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); mudarVolume(-10); return; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') { e.preventDefault(); mudarVolume(10); return; }
  if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); acao('abrir'); return; }
  if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); acao('biblioteca'); return; }
  if (e.code === 'F5') { e.preventDefault(); acao('salvar-estado'); return; }
  if (e.code === 'F6') { e.preventDefault(); acao('estados'); return; }
  if (e.code === 'F8') { e.preventDefault(); acao('carregar-ultimo'); return; }
  if (e.code === 'F11') { e.preventDefault(); acao('cheia'); return; }
  if (!$('#biblioteca').hidden) { listaTecla(e); return; }
  const aberta = ['estados', 'ajuda', 'teclas', 'temas', 'estatisticas'].some((id) => !$('#' + id).hidden);
  if (e.code === 'Escape' && aberta) { fecharJanelas(); return; }
  if (e.code === 'F1') { e.preventDefault(); acao('reiniciar'); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { acao('pausar'); return; }
  if (e.code === 'KeyM') { acao('mudo'); return; }
  if (e.code === 'Tab') { e.preventDefault(); turbo = true; return; }
  if (e.code === 'Backspace') { e.preventDefault(); if (snes) voltandoTecla = true; return; }
  if (TECLAS[e.code] && snes) { e.preventDefault(); teclado |= TECLAS[e.code]; }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') turbo = false;
  if (e.code === 'Backspace') voltandoTecla = false;
  if (TECLAS[e.code]) teclado &= ~TECLAS[e.code];
});
addEventListener('blur', () => { teclado = 0; turbo = false; voltandoTecla = false; });

// ---------------- laço principal ----------------
let ultimo = 0, sobra = 0, contados = 0, marco = 0;
function laco(t) {
  requestAnimationFrame(laco);
  if (snes && voltando() && !rapidoAberto && $('#biblioteca').hidden && $('#bug').hidden) { rebobinarPasso(); ultimo = t; return; }
  if (rebobinou) terminarRebobinar();
  if (!snes || pausado || !$('#biblioteca').hidden || !$('#estados').hidden) { ultimo = t; return; }
  const dt = Math.min(t - ultimo, 100);
  sobra += dt; ultimo = t;
  if (!document.hidden) jogando += dt;   // estatística: só o tempo rodando de verdade
  let vezes = 0;
  try {
    if (turbo) {
      for (let k = 0; k < 4; k++) { rodarQuadro(); snes.apu.dsp.outCount = 0; }
      vezes = 4; sobra = 0;
    } else {
      while (sobra >= QUADRO_MS && vezes < 4) {
        rodarQuadro(); empurrarSom(); sobra -= QUADRO_MS; vezes++;
      }
    }
  } catch (e) {
    pausado = true; avisar('erro no emulador: ' + e.message, 6000); console.error(e);
    if (cacador) abrirBug(e);
    return;
  }
  if (vezes) desenhar();
  desdeFoto += vezes;
  if (rebobLigado && rebob && desdeFoto >= 2) { rebob.gravar(); desdeFoto = 0; }   // ~30 fotos por segundo
  contados += vezes;
  if (t - marco >= 1000) {
    $('#st-fps').textContent = (pausado ? 'pausado · ' : '') + Math.round(contados * 1000 / (t - marco)) + ' fps';
    contados = 0; marco = t; salvarSram();
  }
}
requestAnimationFrame(laco);

// ---------------- caçador de bugs ----------------
// Pra reproduzir um bug exatamente: a cada 10 s o KOFnes tira uma foto do
// estado (um marco) e anota os botões de cada quadro dali pra frente. O pacote
// do bug leva o marco anterior + os botões até agora: rodando de novo, o
// núcleo (determinístico) chega no mesmo lugar, quadro a quadro.
const VERSAO = '{{VERSAO}}', REPO = 'Marcelao98/KOFSnes';
let cacador = ler('cacador') !== '0', marcoBugAnt = null, marcoBug = null, romAtual = null;
function rodarQuadro() {
  const b = semCombo(estado());
  snes.pad[0] = b; snes.runFrame();
  if (marcoBug) { marcoBug.entradas.push(b); if (marcoBug.entradas.length >= 600) novoMarco(); }
}
function novoMarco(zerar) {
  if (zerar) marcoBugAnt = null; else marcoBugAnt = marcoBug;
  marcoBug = cacador && snes ? { estado: KofEstado.capturar(snes), entradas: [] } : null;
}
function marcarCacador() {
  const b = $('[data-acao="cacador-toggle"]');
  b.textContent = 'Caçador de bugs: ' + (cacador ? 'ligado' : 'desligado'); b.classList.toggle('ativo', cacador);
}
let erroBug = null, pausadoAntesBug = false;
function abrirBug(erro) {
  if (!$('#bug').hidden) return;
  erroBug = erro || null;
  pausadoAntesBug = pausado; pausado = true;
  fecharJanelas(); fecharMenus();
  $('#bug-erro').hidden = !erro;
  $('#bug-erro').textContent = erro ? '💥 ' + (erro.message || erro) : '';
  $('#bug-titulo').textContent = erro ? '💥 O emulador quebrou: reportar?' : '🐞 Reportar bug';
  $('#bug-desc').value = '';
  $('#bug-pacote').disabled = !snes; $('#bug-pacote').checked = !!snes;
  $('#bug').hidden = false; $('#bug-desc').focus();
}
function fecharBug() { if ($('#bug').hidden) return; $('#bug').hidden = true; pausado = pausadoAntesBug; sobra = 0; }
async function sha1(bytes) {
  try { return [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))].map((x) => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return '?'; }
}
function b64(u8) { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); }
async function enviarBug() {
  const desc = $('#bug-desc').value.trim() || '(sem descrição)', comPacote = $('#bug-pacote').checked && snes;
  const agora = new Date(), data = agora.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const jogo = snes ? { nome: romNome, titulo: snes.cart.title.trim(), tamanho: romAtual ? romAtual.length : 0, sha1: romAtual ? await sha1(romAtual) : '?', mapeamento: ['LoROM', 'HiROM', 'ExHiROM'][snes.cart.mapper] || '?', superfx: !!snes.cart.superfx } : null;
  const opcoes = `tema ${temaSalvo} · filtro ${filtro} · proporção ${proporcao} · moldura ${moldura} · rebobinar ${rebobLigado ? 'sim' : 'não'}`;
  const erro = erroBug ? { mensagem: String(erroBug.message || erroBug), pilha: String(erroBug.stack || '').slice(0, 1500) } : null;
  let arquivo = '';
  if (comPacote) {
    const base = marcoBugAnt || marcoBug;
    const entradas = base ? (marcoBugAnt ? marcoBugAnt.entradas.concat(marcoBug ? marcoBug.entradas : []) : base.entradas) : [];
    const pacote = {
      formato: 'kofbug', versao: 1, kofnes: VERSAO, quando: agora.toISOString(), descricao: desc, jogo, erro,
      ambiente: { navegador: navigator.userAgent, opcoes },
      replay: base ? { estado: base.estado, entradas: b64(new Uint8Array(Uint16Array.from(entradas).buffer)), quadros: entradas.length } : null,
      agora: { estado: KofEstado.capturar(snes), assinatura: assinatura() },
      print: foto(256),
    };
    arquivo = `kofbug-${(romNome || 'jogo').replace(/[^\w-]+/g, '_').slice(0, 40)}-${data}.json.gz`;
    const blob = await comprimir(JSON.stringify(pacote));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arquivo;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const L = [];
  L.push('### O que aconteceu', '', desc, '');
  if (jogo) L.push('### Jogo', '', `- **ROM:** ${jogo.nome}`, `- **Título interno:** ${jogo.titulo || '?'} · ${jogo.mapeamento}${jogo.superfx ? ' · Super FX' : ''} · ${Math.round(jogo.tamanho / 1024)} KB`, `- **SHA-1:** \`${jogo.sha1}\``, '');
  L.push('### Ambiente', '', `- **KOFnes:** ${VERSAO}`, `- **Navegador:** ${navigator.userAgent}`, `- **Opções:** ${opcoes}`, '');
  if (erro) L.push('### Erro do emulador', '', '```', erro.mensagem, erro.pilha.slice(0, 1200), '```', '');
  if (arquivo) L.push('### Pacote pra reproduzir', '', `📎 **Arraste aqui o arquivo \`${arquivo}\`**, que o KOFnes acabou de baixar (pasta Downloads).`, 'Ele tem o savestate de alguns segundos antes e os botões apertados, pra reproduzir o bug quadro a quadro. A ROM **não** vai junto.', '');
  L.push('---', '_Reportado pelo modo caçador de bugs do KOFnes_');
  const titulo = `[bug] ${jogo ? jogo.nome + ': ' : ''}${desc.split('\n')[0].slice(0, 70)}`;
  const url = `https://github.com/${REPO}/issues/new?labels=bug&title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(L.join('\n')).slice(0, 7000)}`;
  window.open(url, '_blank');
  fecharBug();
  avisar(arquivo ? '🐞 issue aberta no GitHub: arraste o pacote baixado pra dentro dela' : '🐞 issue aberta no GitHub', 6000);
}
function assinatura() { let t = 0; const f = snes.ppu.frame; for (let p = 0; p < 57344; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + snes.cpu.pc; }
// erro na interface (fora do núcleo): oferece reportar, no máximo uma vez por minuto
let ultimoErroUi = 0;
addEventListener('error', (e) => {
  if (!cacador || Date.now() - ultimoErroUi < 60000 || !e.error) return;
  ultimoErroUi = Date.now(); abrirBug(e.error);
});

// ---------------- rebobinar ----------------
// segura Backspace (ou Select+Y no controle) e o jogo volta no tempo, 2x mais
// rápido que o normal; funciona pausado também: volta até o ponto certo e
// aperta F5 pra guardar aquele momento num savestate
let rebob = null, rebobLigado = ler('rebobinar') !== '0', desdeFoto = 0, voltandoTecla = false, rebobinou = 0;
const voltando = () => voltandoTecla || (estado() & 0x6000) === 0x6000;
function novoRebob() { rebob = rebobLigado && snes ? KofEstado.Rebobinador(snes, 48 << 20) : null; desdeFoto = 0; novoMarco(true); }
function mostrarRebob() {
  const s = (rebobinou * 2 / 60).toFixed(1).replace('.', ',');
  avisar(`⏪ −${s} s · ${rebob.fotos ? 'segure pra voltar mais' : 'não dá pra voltar mais'} · F5 salva este momento`, 1500);
}
function rebobinarPasso() {
  if (!rebob) { if (!rebobLigado) avisar('rebobinar está desligado (Emulação → Rebobinar)'); return; }
  if (rebob.voltar()) rebobinou++;
  snes.pad[0] = 0; snes.runFrame(); snes.apu.dsp.outCount = 0;    // um quadro pra ter a imagem daquele momento
  desenhar(); mostrarRebob();
}
function terminarRebobinar() { rebobinou = 0; ini = fim = 0; sobra = 0; desdeFoto = 0; novoMarco(true); }
function voltarSegundos(seg) {   // do menu rápido: volta e fica pausado
  if (!rebob) { avisar('rebobinar está desligado (Emulação → Rebobinar)'); return; }
  let n = 0;
  for (let i = 0; i < seg * 30 && rebob.voltar(); i++) n++;
  snes.pad[0] = 0; snes.runFrame(); snes.apu.dsp.outCount = 0; desenhar(); novoMarco(true);
  avisar(n ? `⏪ voltou ${(n * 2 / 60).toFixed(1).replace('.', ',')} s` : 'não dá pra voltar mais');
}
function marcarRebob() {
  const b = $('[data-acao="rebob-toggle"]');
  b.textContent = 'Rebobinar (Backspace): ' + (rebobLigado ? 'ligado' : 'desligado'); b.classList.toggle('ativo', rebobLigado);
}

// ---------------- ROMs ----------------
async function lerZip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('zip inválido');
  let p = v.getUint32(e + 16, true);
  const total = v.getUint16(e + 10, true);
  for (let k = 0; k < total; k++) {
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const loc = v.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (!/\.(sfc|smc|fig|swc)$/i.test(nome)) continue;
    const dados = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
    const bruto = u8.subarray(dados, dados + tam);
    if (metodo === 0) return { nome, bytes: bruto };
    if (metodo !== 8) throw new Error('zip com compressão não suportada');
    const s = new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { nome, bytes: new Uint8Array(await new Response(s).arrayBuffer()) };
  }
  throw new Error('o zip não tem .sfc/.smc dentro');
}
// ---------------- banco interno (IndexedDB) ----------------
// c: configurações (a pasta de ROMs) · jogos: nome, prints, quando jogou ·
// roms: a ROM de cada jogo · autos: o estado automático de cada jogo ·
// estados: savestates (comprimidos) com o print do momento. ROM e estado
// automático ficam fora de "jogos": abrir a biblioteca lê só o que mostra.
let bd = null;
function abrirBanco() {
  if (bd) return bd;
  bd = new Promise((ok, falha) => {
    const r = indexedDB.open('kofnes', 5);
    r.onupgradeneeded = (ev) => {
      const b = r.result;
      if (!b.objectStoreNames.contains('c')) b.createObjectStore('c');
      if (!b.objectStoreNames.contains('jogos')) b.createObjectStore('jogos', { keyPath: 'id' });
      if (!b.objectStoreNames.contains('estados')) b.createObjectStore('estados', { keyPath: 'n', autoIncrement: true }).createIndex('jogo', 'jogo');
      if (!b.objectStoreNames.contains('capas')) b.createObjectStore('capas');   // nome do jogo -> capa (Blob) ou {falhou}
      if (!b.objectStoreNames.contains('stats')) b.createObjectStore('stats', { keyPath: 'id' });   // tempo jogado, sessões, por dia
      if (!b.objectStoreNames.contains('roms')) b.createObjectStore('roms');
      if (!b.objectStoreNames.contains('autos')) b.createObjectStore('autos');
      if (ev.oldVersion >= 1 && ev.oldVersion < 5) {   // versão antiga: tira ROM e estado automático de dentro de "jogos"
        const t = r.transaction, roms = t.objectStore('roms'), autos = t.objectStore('autos');
        t.objectStore('jogos').openCursor().onsuccess = (e) => {
          const c = e.target.result; if (!c) return;
          const j = c.value;
          if (j.rom) roms.put(j.rom, j.id);
          if (j.auto) autos.put(j.auto, j.id);
          j.temAuto = !!j.auto; delete j.rom; delete j.auto;
          c.update(j); c.continue();
        };
      }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  return bd;
}
async function bdOp(loja, modo, f) {
  const b = await abrirBanco();
  return new Promise((ok, falha) => {
    const t = b.transaction(loja, modo), q = f(t.objectStore(loja));
    t.oncomplete = () => ok(q && q.result); t.onerror = () => falha(t.error);
  });
}
const bdTodos = (loja) => bdOp(loja, 'readonly', (o) => o.getAll());
const bdPegar = (loja, k) => bdOp(loja, 'readonly', (o) => o.get(k));
const bdPor = (loja, k, v) => bdOp(loja, 'readwrite', (o) => o.put(v, k));
const bdGuardar = (loja, v) => bdOp(loja, 'readwrite', (o) => o.put(v));
const bdApagar = (loja, k) => bdOp(loja, 'readwrite', (o) => o.delete(k));
const bdTem = (loja, k) => bdOp(loja, 'readonly', (o) => o.count(k)).then((n) => n > 0);
// lê, muda e grava o registro de um jogo NUMA transação só: o estado automático,
// a capa baixada e a troca de jogo podem chegar juntos, e um não apaga o outro
const bdMudarJogo = (id, f) => bdMudar('jogos', id, f);
function bdMudar(loja, id, f) {
  return bdOp(loja, 'readwrite', (o) => {
    const q = o.get(id);
    q.onsuccess = () => { const novo = f(q.result); if (novo) o.put(novo); };
    return q;
  });
}
async function comprimir(texto) {
  return new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function descomprimir(blob) {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
function foto(largura) {   // print do quadro (sem filtro); webp quando dá: bem menor
  const cru = document.createElement('canvas'); cru.width = 256; cru.height = 224;
  cru.getContext('2d').putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = largura; c.height = Math.round(largura * 224 / 256);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(cru, 0, 0, c.width, c.height);
  const w = c.toDataURL('image/webp', 0.85);
  return w.startsWith('data:image/webp') ? w : c.toDataURL('image/png');
}
const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------------- abrir um jogo ----------------
let jogoId = '';
async function abrirArquivo(arq) {
  try {
    let nome = arq.name, bytes = new Uint8Array(await arq.arrayBuffer());
    if (/\.zip$/i.test(nome)) ({ nome, bytes } = await lerZip(bytes.buffer));
    await abrirBytes(nome, bytes, true);
  } catch (e) { avisar(e.message, 5000); }
}
async function abrirBytes(nome, bytes, guardarNaBiblioteca) {
  if (bytes.length < 0x8000) throw new Error('isso não parece uma ROM de SNES');
  registrarTempo(); salvarSram(); await salvarAuto();
  const s = new KofNucleo.Snes(Int32Array.from(bytes));
  romNome = nome.replace(/\.[^.]+$/, '');
  jogoId = s.cart.title.trim() + '|' + bytes.length;
  chaveSram = 'sram.' + s.cart.title.trim() + '.' + bytes.length;
  const salvo = ler(chaveSram);
  if (salvo && s.cart.hasSram()) {
    const b = atob(salvo);
    for (let i = 0; i < b.length && i < s.cart.sram.length; i++) s.cart.sram[i] = b.charCodeAt(i);
  }
  s.reset();
  snes = s; romAtual = bytes; sramAntes = textoSram(); pausado = false; sobra = 0; novoRebob();
  document.body.classList.remove('vazio');
  fecharJanelas();
  $('#st-jogo').textContent = romNome + ' · ' + (s.cart.title.trim() || '?');
  document.title = 'KOFnes — ' + romNome;
  ajustarEscala();
  // a ROM vai pra biblioteca: da próxima vez abre sem diálogo nenhum
  try {
    const novo = { id: jogoId, nome: romNome, arquivo: nome, titulo: s.cart.title.trim(), tamanho: bytes.length, ultimo: Date.now() };
    const id = jogoId;
    await bdMudarJogo(id, (antigo) => ({ ...(antigo || {}), ...novo }));
    if (guardarNaBiblioteca || !(await bdTem('roms', id))) await bdPor('roms', id, bytes);
    autoAntes = Date.now();
  } catch (e) { console.warn('biblioteca indisponível', e); }
  contarSessao(jogoId, romNome);
}
async function atualizarCapa() {   // print do jogo atual vira a capa dele na biblioteca
  if (!snes || !jogoId) return;
  try {
    const capa = foto(256), agora = Date.now();
    await bdMudarJogo(jogoId, (j) => j && Object.assign(j, { capa, ultimo: agora }));
  } catch (e) { /* sem banco */ }
}
function textoSram() {
  if (!snes || !snes.cart.hasSram()) return '';
  let t = ''; const s = snes.cart.sram;
  for (let i = 0; i < s.length; i++) t += String.fromCharCode(s[i] & 0xFF);
  return t;
}
function salvarSram() {
  if (!snes || !chaveSram) return;
  const t = textoSram();
  if (t && t !== sramAntes) { guardar(chaveSram, btoa(t)); sramAntes = t; }
}
addEventListener('pagehide', () => { registrarTempo(); salvarSram(); salvarAuto(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { registrarTempo(); salvarSram(); salvarAuto(); } });

// ---------------- estatísticas ----------------
// por jogo: tempo jogado (só com o jogo rodando), sessões, primeira e última vez,
// e o tempo de cada dia (pro gráfico dos últimos dias)
let jogando = 0, estat = {};
const hoje = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function registrarTempo() {
  if (!jogoId || jogando < 1000) return;
  const ms = Math.round(jogando), id = jogoId, nome = romNome, dia = hoje(Date.now()); jogando = 0;
  bdMudar('stats', id, (e) => {
    e = e || { id, nome, tempo: 0, sessoes: 1, primeiro: Date.now(), dias: {} };
    e.tempo += ms; e.ultimo = Date.now(); e.nome = nome;
    e.dias[dia] = (e.dias[dia] || 0) + ms;
    const dias = Object.keys(e.dias).sort();                        // guarda ~1 ano de dias
    while (dias.length > 400) delete e.dias[dias.shift()];
    estat[id] = e; return e;
  }).catch(() => {});
}
function contarSessao(id, nome) {
  bdMudar('stats', id, (e) => {
    e = e || { id, nome, tempo: 0, sessoes: 0, primeiro: Date.now(), dias: {} };
    e.sessoes++; e.ultimo = Date.now(); e.nome = nome; estat[id] = e; return e;
  }).catch(() => {});
}
setInterval(registrarTempo, 10000);
function duracao(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return ms > 0 ? 'menos de 1 min' : '0 min';
  return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'min';
}
async function carregarEstat() {
  registrarTempo();
  try { estat = {}; (await bdTodos('stats')).forEach((e) => { estat[e.id] = e; }); } catch (e) { /* sem banco */ }
}
async function mostrarEstat() {
  fecharJanelas(); $('#estatisticas').hidden = false;
  await new Promise((ok) => setTimeout(ok, 50));   // deixa o registrarTempo gravar
  await carregarEstat();
  const lista = Object.values(estat).filter((e) => e.sessoes || e.tempo).sort((a, b) => b.tempo - a.tempo);
  const total = lista.reduce((t, e) => t + e.tempo, 0), sess = lista.reduce((t, e) => t + e.sessoes, 0);
  const cx = (rot, val) => `<div class="est-caixa"><small>${rot}</small><b>${val}</b></div>`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let h = '<div class="est-caixas">' + cx('Tempo total', duracao(total)) + cx('Jogos', lista.length) + cx('Sessões', sess)
    + cx('Mais jogado', lista[0] ? esc(lista[0].nome) : '—') + '</div>';
  // últimos 7 dias, todos os jogos somados
  const dias = [];
  for (let i = 6; i >= 0; i--) { const t = Date.now() - i * 864e5; dias.push([hoje(t), new Date(t)]); }
  const porDia = dias.map(([k]) => lista.reduce((t, e) => t + ((e.dias || {})[k] || 0), 0));
  const maxD = Math.max(60000, ...porDia);
  h += '<h3>Últimos 7 dias</h3><div class="est-dias">' + dias.map(([, d], i) => {
    const sem = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    return `<div class="est-dia" title="${d.toLocaleDateString('pt-BR')}: ${duracao(porDia[i])}"><span class="est-val">${porDia[i] >= 60000 ? duracao(porDia[i]) : ''}</span>`
      + `<span class="est-coluna"><i style="height:${(porDia[i] / maxD * 100).toFixed(1)}%"></i></span><small>${sem}</small></div>`;
  }).join('') + '</div>';
  h += '<h3>Por jogo</h3>';
  if (!lista.length) h += '<p class="dica">Ainda não tem nada aqui: jogue um pouco e volte.</p>';
  else {
    const maxT = Math.max(1, lista[0].tempo);
    h += '<table class="est-tab"><tr><th>Jogo</th><th>Tempo jogado</th><th>Sessões</th><th>Última vez</th><th>Primeira vez</th></tr>'
      + lista.map((e) => `<tr><td>${esc(e.nome)}</td><td><span class="est-barra" title="${duracao(e.tempo)}"><i style="width:${(e.tempo / maxT * 100).toFixed(1)}%"></i></span>${duracao(e.tempo)}</td>`
        + `<td>${e.sessoes}</td><td>${e.ultimo ? quando(e.ultimo) : '—'}</td><td>${e.primeiro ? quando(e.primeiro) : '—'}</td></tr>`).join('') + '</table>';
  }
  $('#corpo-estat').innerHTML = h;
}

$('#arquivo').addEventListener('change', (e) => { if (e.target.files[0]) abrirArquivo(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('arrastando'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('arrastando'); });
addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('arrastando');
  if (e.dataTransfer.files[0]) abrirArquivo(e.dataTransfer.files[0]);
});

// ---------------- continuar de onde parou ----------------
// um estado automático por jogo (fica no registro do jogo na biblioteca)
let autoAntes = 0, autoSalvar = ler('autoSalvar') !== '0';   // opção: Emulação → Salvar automático
function marcarAuto() {
  const b = $('[data-acao="auto-toggle"]');
  b.textContent = 'Salvar automático: ' + (autoSalvar ? 'ligado' : 'desligado'); b.classList.toggle('ativo', autoSalvar);
}
async function salvarAuto() {
  if (!autoSalvar || !snes || !jogoId) return;
  try {
    const texto = JSON.stringify(KofEstado.capturar(snes)), capa = foto(256);
    const quandoAgora = Date.now();
    const id = jogoId;
    await bdPor('autos', id, texto);
    await bdMudarJogo(id, (j) => j && Object.assign(j, { temAuto: true, autoQuando: quandoAgora, autoCapa: capa, capa, ultimo: quandoAgora }));
    autoAntes = Date.now();
  } catch (e) { console.warn('auto-save falhou', e); }
}
setInterval(() => { if (snes && !pausado && Date.now() - autoAntes > 30000) salvarAuto(); }, 5000);

// ---------------- savestates ----------------
async function salvarEstado() {
  if (!snes) { avisar('abra um jogo primeiro'); return; }
  try {
    const dados = await comprimir(JSON.stringify(KofEstado.capturar(snes)));
    await bdGuardar('estados', { jogo: jogoId, nome: romNome, quando: Date.now(), capa: foto(256), dados });
    atualizarCapa();
    avisar('💾 estado salvo');
    if (!$('#estados').hidden) mostrarEstados(jogoId);
  } catch (e) { avisar('não consegui salvar o estado: ' + e.message, 4000); }
}
async function carregarEstado(est) {
  try {
    if (est.jogo !== jogoId) {          // estado de outro jogo: abre o jogo antes
      const j = await bdPegar('jogos', est.jogo), rom = await bdPegar('roms', est.jogo);
      if (!j || !rom) { avisar('a ROM desse jogo não está na biblioteca', 4000); return; }
      await abrirBytes(j.arquivo || j.nome, rom, false);
    }
    KofEstado.restaurar(snes, JSON.parse(await descomprimir(est.dados)));
    snes.apu.dsp.outCount = 0; ini = fim = 0; sobra = 0; pausado = false; novoRebob();
    fecharJanelas();
    snes.runFrame(); snes.apu.dsp.outCount = 0; desenhar();
    avisar('estado de ' + quando(est.quando) + ' carregado');
  } catch (e) { avisar('não consegui carregar: ' + e.message, 4000); }
}
async function continuar(j) {
  const rom = await bdPegar('roms', j.id);
  if (!rom) throw new Error('a ROM desse jogo não está na biblioteca');
  const auto = j.temAuto ? await bdPegar('autos', j.id) : null;
  await abrirBytes(j.arquivo || j.nome, rom, false);
  if (!auto) return;
  KofEstado.restaurar(snes, JSON.parse(auto));
  snes.apu.dsp.outCount = 0; ini = fim = 0; sobra = 0; novoRebob();
  snes.runFrame(); snes.apu.dsp.outCount = 0; desenhar();
  avisar('continuando de ' + quando(j.autoQuando));
}
async function estadosDe(id) {
  return (await bdTodos('estados')).filter((e) => e.jogo === id).sort((a, b) => b.quando - a.quando);
}
async function carregarUltimo() {
  if (!snes) { avisar('abra um jogo primeiro'); return; }
  const l = await estadosDe(jogoId);
  if (l.length) carregarEstado(l[0]); else avisar('nenhum estado salvo deste jogo (F5 salva)');
}
async function mostrarEstados(id) {
  fecharJanelas(); $('#estados').hidden = false;
  const todos = await bdTodos('estados'), jogos = await bdTodos('jogos');
  const nomes = {}; jogos.forEach((j) => { nomes[j.id] = j.nome; });
  todos.forEach((e) => { if (!nomes[e.jogo]) nomes[e.jogo] = e.nome; });
  const ids = [...new Set([id || jogoId, ...todos.map((e) => e.jogo)].filter(Boolean))];
  const sel = $('#estados-jogo'); sel.innerHTML = '';
  ids.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = nomes[k] || k.split('|')[0]; sel.appendChild(o); });
  const atual = id || jogoId || ids[0] || '';
  sel.value = atual;
  const lista = todos.filter((e) => e.jogo === atual).sort((a, b) => b.quando - a.quando);
  const g = $('#grade-estados'); g.innerHTML = '';
  const jAuto = jogos.find((j) => j.id === atual);
  if (jAuto && jAuto.temAuto) {
    const c = document.createElement('div'); c.className = 'cartao auto';
    const im = document.createElement('img'); im.src = jAuto.autoCapa; im.alt = '';
    const rot = document.createElement('div'); rot.className = 'cartao-rot'; rot.textContent = '⟳ automático · ' + quando(jAuto.autoQuando);
    c.append(im, rot); c.onclick = () => continuar(jAuto).catch((e) => avisar(e.message, 4000));
    g.appendChild(c);
  }
  for (const e of lista) {
    const c = document.createElement('div'); c.className = 'cartao';
    const im = document.createElement('img'); im.src = e.capa; im.alt = '';
    const rot = document.createElement('div'); rot.className = 'cartao-rot'; rot.textContent = quando(e.quando);
    const ap = document.createElement('button'); ap.className = 'x'; ap.title = 'apagar'; ap.textContent = '🗑';
    ap.onclick = async (ev) => { ev.stopPropagation(); await bdApagar('estados', e.n); mostrarEstados(atual); };
    rot.appendChild(ap);
    c.append(im, rot); c.onclick = () => carregarEstado(e);
    g.appendChild(c);
  }
  $('#estados-vazio').hidden = lista.length > 0 || !!(jAuto && jAuto.temAuto);
}
$('#estados-jogo').addEventListener('change', (e) => mostrarEstados(e.target.value));

// ---------------- biblioteca (estilo ZSNES) ----------------
// jogos já abertos (guardados aqui dentro) + os da pasta de ROMs escolhida
// uma vez; tudo dentro da janela, sem diálogo do Windows
const temPasta = 'showDirectoryPicker' in window;
let pasta = null, itens = [], visiveis = [], selecionada = 0, contagem = {};
async function varrer(dir, pre, prof, saida) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory' && prof < 2) await varrer(h, pre + nome + '/', prof + 1, saida);
    else if (h.kind === 'file' && /\.(sfc|smc|zip|fig|swc)$/i.test(nome)) saida.push({ nome, h });
  }
}
async function lerPasta(pedir) {
  if (!temPasta) return [];
  try {
    if (!pasta) pasta = await bdPegar('c', 'pasta');
    if (!pasta) return [];
    let p = await pasta.queryPermission({ mode: 'read' });
    if (p !== 'granted' && pedir) p = await pasta.requestPermission({ mode: 'read' });
    if (p !== 'granted') return [];
    const l = []; await varrer(pasta, '', 0, l); return l;
  } catch (e) { return []; }
}
async function montarItens(pedir) {
  let jogos = [];
  await carregarEstat();
  try { jogos = await bdTodos('jogos'); contagem = {}; (await bdTodos('estados')).forEach((e) => { contagem[e.jogo] = (contagem[e.jogo] || 0) + 1; }); } catch (e) { /* sem banco */ }
  const daPasta = await lerPasta(pedir);
  const ja = new Set(jogos.map((j) => (j.arquivo || '').toLowerCase()));
  itens = jogos.sort((a, b) => b.ultimo - a.ultimo).map((j) => ({ nome: j.nome, jogo: j }))
    .concat(daPasta.filter((r) => !ja.has(r.nome.toLowerCase()))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
      .map((r) => ({ nome: r.nome.replace(/\.[^.]+$/, ''), h: r.h, ext: r.nome.split('.').pop().toUpperCase() })));
}
// ---------------- capas oficiais ----------------
// acervo aberto libretro-thumbnails (o mesmo do RetroArch), pelo nome No-Intro
// da ROM. Baixa uma vez e guarda no banco: depois funciona sem internet.
const CAPAS = 'https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System/master/Named_Boxarts/';
let capasNet = ler('capas') !== '0';
const urlsCapa = new Map();
// nome da ROM -> nomes possíveis no acervo (padrão No-Intro). Converte o padrão
// GoodTools ("Jogo (U) (V1.2) [!]" -> "Jogo (USA) (Rev 2)") e tenta as variações
// de revisão e de idiomas ("(USA) (En,Fr)") que o acervo usa.
const REGIOES = { U: 'USA', E: 'Europe', J: 'Japan', B: 'Brazil', F: 'France', G: 'Germany', S: 'Spain', I: 'Italy', K: 'Korea', A: 'Australia',
  UE: 'USA, Europe', EU: 'USA, Europe', JU: 'Japan, USA', UJ: 'Japan, USA', JUE: 'World', W: 'World' };
function nomesCapa(nome) {
  let n = nome.replace(/[&*/:`<>?\\|"]/g, '_').replace(/\s*\[[^\]]*\]/g, '').trim();
  n = n.replace(/\((JUE|UE|EU|JU|UJ|U|E|J|B|F|G|S|I|K|A|W)\)/g, (_, r) => `(${REGIOES[r]})`);
  n = n.replace(/\s*\(V1\.0\)/gi, '').replace(/\(V1\.(\d)\)/gi, (_, v) => `(Rev ${v})`).replace(/\s+/g, ' ').trim();
  const semRev = n.replace(/\s*\((Rev [^)]*|Beta[^)]*|Proto[^)]*|v\d[^)]*)\)/gi, '').trim();
  const base = semRev.replace(/^(.*?\([^)]*\)).*$/, '$1');                 // "Nome (Região)"
  const titulo = base.replace(/\s*\(.*$/, '').trim();
  const idiomas = ['(En,Fr)', '(En,Fr,De)', '(En,De)', '(En,Fr,De,Es,It)'].map((l) => base + ' ' + l);
  return [...new Set([n, semRev, base, ...idiomas, titulo + ' (USA)', titulo + ' (World)', titulo + ' (Europe)'])];
}
async function baixarCapa(nome) {
  for (const n of nomesCapa(nome)) {
    let r = await fetch(CAPAS + encodeURIComponent(n) + '.png').catch(() => null);
    if (!r || !r.ok) continue;
    if (!(r.headers.get('content-type') || '').startsWith('image/')) {   // atalho (symlink) do git
      const alvo = (await r.text()).trim();
      if (!/\.png$/i.test(alvo) || alvo.length > 200) continue;
      r = await fetch(CAPAS + encodeURIComponent(alvo.split('/').pop())).catch(() => null);
      if (!r || !r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) continue;
    }
    return r.blob();
  }
  return null;
}
// cache de capas pelo nome do jogo (serve pros jogos da pasta e da biblioteca)
const capasMem = new Map(), buscando = new Set();
async function capaPorNome(nome) {
  if (!capasNet || !nome || buscando.has(nome)) return;
  if (!capasMem.has(nome)) {
    const guardada = await bdPegar('capas', nome).catch(() => null) || null;
    capasMem.set(nome, guardada);
    if (guardada instanceof Blob) { capaChegou(nome); return; }   // veio do cache: põe ela no lugar
  }
  const c = capasMem.get(nome);
  if (c instanceof Blob || (c && c.falhou && Date.now() - c.falhou < 7 * 864e5)) return;
  buscando.add(nome);
  await vagaCapa();
  try {
    const blob = await baixarCapa(nome);
    const v = blob || { falhou: Date.now() };
    capasMem.set(nome, v); await bdPor('capas', nome, v).catch(() => {});
    if (blob) capaChegou(nome);
  } finally { buscando.delete(nome); liberarCapa(); }
}
let baixandoCapas = 0;
const filaCapas = [];
const vagaCapa = () => new Promise((ok) => { if (baixandoCapas < 3) { baixandoCapas++; ok(); } else filaCapas.push(ok); });
function liberarCapa() { const p = filaCapas.shift(); if (p) p(); else baixandoCapas--; }
// uma capa ficou pronta: troca só a miniatura daquele jogo (e o painel, se ele está selecionado)
function capaChegou(nome) {
  if ($('#biblioteca').hidden) return;
  lis.forEach((li, i) => {
    const r = visiveis[i];
    if (!r || r.nome !== nome || !sofa) return;
    const fig = li.querySelector('.mini'), src = srcCapa(r);
    if (fig && src) { fig.textContent = ''; const im = document.createElement('img'); im.src = src; im.alt = ''; fig.appendChild(im); }
  });
  const sel = visiveis[selecionada];
  if (sel && sel.nome === nome) mostrarInfo();
}
function srcCapa(r) {   // capa oficial (do cache), senão o print de quando parou
  const c = r && capasNet ? capasMem.get(r.nome) : null;
  if (c instanceof Blob) {
    if (!urlsCapa.has(r.nome)) urlsCapa.set(r.nome, URL.createObjectURL(c));
    return urlsCapa.get(r.nome);
  }
  return r && r.jogo ? (r.jogo.autoCapa || r.jogo.capa || '') : '';
}
const temCapaOficial = (r) => !!(r && capasNet && capasMem.get(r.nome) instanceof Blob);

// ---------------- modo sofá ----------------
// grade de capas em tela cheia, feita pro controle: setas, A joga, X estados
let sofa = ler('sofa') === '1';
function modoSofa(liga) {
  sofa = liga; guardar('sofa', liga ? '1' : '0');
  document.body.classList.toggle('sofa', liga);
  if (liga && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!$('#biblioteca').hidden) montarLista();
}
function colunas() {
  if (!sofa) return 1;
  const lis = $('#roms').children;
  if (lis.length < 2) return 1;
  const y = lis[0].offsetTop; let n = 0;
  while (n < lis.length && lis[n].offsetTop === y) n++;
  return Math.max(1, n);
}

// a lista é construída uma vez (abrir, filtrar, trocar de modo); andar com as
// setas só troca a seleção (marcarSel). No sofá, cada capa só é pedida quando
// o cartão aparece na tela.
let lis = [];
const olhoCapas = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  olhoCapas.unobserve(e.target);
  const r = visiveis[+e.target.dataset.i]; if (r) capaPorNome(r.nome).catch(() => {});
}), { root: $('#roms'), rootMargin: '200px' }) : null;
function montarLista() {
  const f = $('#filtro').value.toLowerCase(), ul = $('#roms');
  visiveis = itens.filter((r) => r.nome.toLowerCase().includes(f));
  selecionada = Math.max(0, Math.min(selecionada, visiveis.length - 1));
  if (olhoCapas) olhoCapas.disconnect();
  ul.innerHTML = ''; lis = [];
  const frag = document.createDocumentFragment();
  visiveis.forEach((r, i) => {
    const li = document.createElement('li'); li.dataset.i = i;
    if (sofa) {
      const src = srcCapa(r), fig = document.createElement('div'); fig.className = 'mini';
      if (olhoCapas) olhoCapas.observe(li); else capaPorNome(r.nome).catch(() => {});
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; im.loading = 'lazy'; fig.appendChild(im); } else fig.textContent = '☕';
      li.appendChild(fig);
    }
    const nm = document.createElement('span'); nm.textContent = r.nome; li.appendChild(nm);
    const sm = document.createElement('small');
    sm.textContent = r.jogo ? (contagem[r.jogo.id] ? '💾 ' + contagem[r.jogo.id] : '★') : r.ext;
    li.appendChild(sm);
    li.onclick = () => { if (selecionada === i) jogar(); else marcarSel(i); };
    lis.push(li); frag.appendChild(li);
  });
  ul.appendChild(frag);
  $('#lista-vazia').hidden = itens.length > 0;
  $('#lista-vazia').innerHTML = temPasta
    ? 'Nenhum jogo ainda. Escolha a <b>pasta de ROMs</b> (só uma vez) ou arraste uma ROM pra cá.'
    : 'Nenhum jogo ainda. Arraste uma ROM pra cá ou use <b>Adicionar arquivo</b>.';
  marcarSel(selecionada);
}
function marcarSel(i) {
  if (lis[selecionada]) lis[selecionada].classList.remove('sel');
  selecionada = Math.max(0, Math.min(i, visiveis.length - 1));
  const li = lis[selecionada];
  if (li) { li.classList.add('sel'); li.scrollIntoView({ block: 'nearest' }); }
  mostrarInfo();
}
function mostrarInfo() {
  const r = visiveis[selecionada], img = $('#capa-img');
  if (!r) { $('#info-nome').textContent = 'KOFnes'; $('#info-det').textContent = 'Super Nintendo escrito em Kof'; img.hidden = true; $('#capa-vazia').hidden = false; return; }
  $('#info-nome').textContent = r.nome;
  if (r.jogo) {
    const n = contagem[r.jogo.id] || 0;
    const e = estat[r.jogo.id], tempo = e && e.tempo ? ` · ${duracao(e.tempo)} no total em ${e.sessoes} ${e.sessoes === 1 ? 'sessão' : 'sessões'}` : '';
    $('#info-det').textContent = `jogado ${quando(r.jogo.ultimo)}${tempo} · ${n} ${n === 1 ? 'estado salvo' : 'estados salvos'} · ${(r.jogo.tamanho / 1048576).toFixed(1)} MB`;
  } else $('#info-det').textContent = 'na pasta de ROMs · ainda não jogado';
  const auto = autoSalvar && !!(r.jogo && r.jogo.temAuto);
  $('[data-acao="jogar"]').textContent = auto ? '▶ Continuar' : '▶ Jogar';
  $('[data-acao="do-zero"]').hidden = !auto;
  if (auto) $('#info-det').textContent += ` · parou em ${quando(r.jogo.autoQuando)}`;
  const src = srcCapa(r), oficial = temCapaOficial(r);
  img.hidden = !src; $('#capa-vazia').hidden = !!src; if (src) img.src = src;
  img.classList.toggle('oficial', oficial);
  const parou = $('#parou-img'), mostrarParou = !!(oficial && r.jogo && r.jogo.autoCapa);
  parou.hidden = !mostrarParou; if (mostrarParou) parou.src = r.jogo.autoCapa;
  capaPorNome(r.nome).catch(() => {});
}
async function jogar(doZero) {
  const r = visiveis[selecionada];
  if (!r) return;
  try {
    if (autoSalvar && r.jogo && r.jogo.temAuto && !doZero) await continuar(r.jogo);
    else if (r.jogo) {
      const rom = await bdPegar('roms', r.jogo.id);
      if (!rom) throw new Error('a ROM desse jogo não está na biblioteca');
      await abrirBytes(r.jogo.arquivo || r.nome, rom, false);
    }
    else await abrirArquivo(await r.h.getFile());
  } catch (e) { avisar(e.message, 4000); }
}
function listaTecla(e) {
  if (e.code === 'Escape') { if (snes) fecharJanelas(); return true; }
  const passo = { ArrowDown: colunas(), ArrowUp: -colunas(), ArrowRight: sofa ? 1 : 0, ArrowLeft: sofa ? -1 : 0 }[e.code];
  if (passo) {
    e.preventDefault(); marcarSel(selecionada + passo); return true;
  }
  if (e.code === 'Enter') { e.preventDefault(); jogar(!!e.shiftKey); return true; }
  if (e.code === 'F6' || (e.code === 'KeyE' && e.target !== $('#filtro'))) { e.preventDefault(); acao('estados-do-sel'); return true; }
  if (e.target !== $('#filtro') && e.key.length === 1 && !e.ctrlKey) $('#filtro').focus();   // digitar já procura
  return true;
}
$('#filtro').addEventListener('input', () => { selecionada = 0; montarLista(); });
async function mostrarBiblioteca(pedir) {
  fecharJanelas(); $('#biblioteca').hidden = false;
  await montarItens(pedir);
  $('#filtro').value = '';
  const k = itens.findIndex((r) => r.jogo && r.jogo.id === jogoId);   // o jogo atual vem selecionado
  selecionada = k >= 0 ? k : 0;
  montarLista();
}
function fecharJanelas() { fecharTemas(); for (const id of ['biblioteca', 'estados', 'ajuda', 'teclas', 'estatisticas']) $('#' + id).hidden = true; capturando = null; if (rapidoAberto) fecharRapido(); }
// controle também navega na biblioteca
let padAntes = 0;
setInterval(() => {
  if ($('#biblioteca').hidden) { padAntes = 0; return; }
  const b = estado(), novo = b & ~padAntes; padAntes = b;
  const ir = (code) => listaTecla({ code, preventDefault() {}, target: null, key: '' });
  if (novo & 0x0400) ir('ArrowDown');
  if (novo & 0x0800) ir('ArrowUp');
  if (novo & 0x0100) ir('ArrowRight');
  if (novo & 0x0200) ir('ArrowLeft');
  if (novo & (0x0080 | 0x1000)) jogar(false);     // A ou Start: joga / continua
  if (novo & 0x4000) jogar(true);                 // Y: começar do zero
  if (novo & 0x0040) acao('estados-do-sel');      // X: estados salvos
  if (novo & 0x2000) modoSofa(!sofa);             // Select: liga/desliga o sofá
}, 50);

// ---------------- menu rápido (Select+Start / F2) ----------------
// por cima do jogo, pausado; teclado ou controle, sem precisar do mouse
let rapidoAberto = false, pausadoAntesRapido = false, selR = 0;
const ciclar = (lista, atual, d) => lista[(lista.findIndex(([k]) => k === atual) + d + lista.length) % lista.length][0];
const ITENS_RAPIDO = [
  { t: '▶ Continuar', f: () => fecharRapido() },
  { t: '💾 Salvar estado', f: () => { fecharRapido(); salvarEstado(); } },
  { t: '⟲ Carregar último estado', f: () => { fecharRapido(); carregarUltimo(); } },
  { t: '⏪ Voltar 5 segundos', f: () => { voltarSegundos(5); } },
  { t: '🐞 Reportar bug', f: () => { fecharRapido(); abrirBug(); } },
  { t: '🗂 Estados salvos', f: () => { fecharRapido(); acao('estados'); } },
  { t: '☕ Biblioteca', f: () => { fecharRapido(); acao('biblioteca'); } },
  { t: 'Filtro', v: () => FILTROS.find(([k]) => k === filtro)[1], aj: (d) => aplicarFiltro(ciclar(FILTROS, filtro, d)) },
  { t: 'Proporção', v: () => PROPORCOES.find(([k]) => k === proporcao)[1], aj: (d) => mudarProporcao(ciclar(PROPORCOES, proporcao, d)) },
  { t: 'Moldura', v: () => MOLDURAS.find(([k]) => k === moldura)[1], aj: (d) => mudarMoldura(ciclar(MOLDURAS, moldura, d)) },
  { t: 'Volume', v: () => (mudo ? 'mudo' : volume + '%'), aj: (d) => mudarVolume(d * 10) },
  { t: '⛶ Tela cheia', f: () => acao('cheia') },
  { t: '↺ Reiniciar', f: () => { fecharRapido(); acao('reiniciar'); } },
];
function montarRapido() {
  const ul = $('#rapido-lista'); ul.innerHTML = '';
  ITENS_RAPIDO.forEach((it, i) => {
    const li = document.createElement('li'); if (i === selR) li.className = 'sel';
    const nm = document.createElement('span'); nm.textContent = it.t; li.appendChild(nm);
    if (it.aj) {
      const aj = document.createElement('span'); aj.className = 'ajuste';
      const m = document.createElement('button'); m.textContent = '◀'; m.onclick = (e) => { e.stopPropagation(); selR = i; it.aj(-1); montarRapido(); };
      const v = document.createElement('b'); v.textContent = it.v();
      const p = document.createElement('button'); p.textContent = '▶'; p.onclick = (e) => { e.stopPropagation(); selR = i; it.aj(1); montarRapido(); };
      aj.append(m, v, p); li.appendChild(aj);
      li.onclick = () => { selR = i; montarRapido(); };
    } else li.onclick = () => { selR = i; it.f(); };
    ul.appendChild(li);
  });
}
function abrirRapido() {
  if (!snes || rapidoAberto || !$('#bug').hidden) return;
  fecharMenus(); fecharJanelas();
  rapidoAberto = true; pausadoAntesRapido = pausado; pausado = true; teclado = 0;
  selR = 0; montarRapido(); $('#rapido').hidden = false;
}
function fecharRapido() {
  if (!rapidoAberto) return;
  rapidoAberto = false; $('#rapido').hidden = true; pausado = pausadoAntesRapido; sobra = 0;
}
function rapidoTecla(e) {
  const it = ITENS_RAPIDO[selR];
  if (e.repeat && e.code === 'Enter') { e.preventDefault(); return; }   // Enter ainda segurado do Select+Start
  if (['Escape', 'Backspace', 'F2'].includes(e.code)) { e.preventDefault(); fecharRapido(); return; }
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault(); selR = (selR + (e.code === 'ArrowDown' ? 1 : -1) + ITENS_RAPIDO.length) % ITENS_RAPIDO.length; montarRapido(); return;
  }
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && it.aj) { e.preventDefault(); it.aj(e.code === 'ArrowRight' ? 1 : -1); montarRapido(); return; }
  if (e.code === 'Enter') { e.preventDefault(); if (it.f) it.f(); else { it.aj(1); montarRapido(); } }
}
// atalhos do controle (e das teclas configuradas): Select+Start menu, Select+L salva, Select+R carrega
let comboAntes = 0;
setInterval(() => {
  const b = estado(), novo = b & ~comboAntes; comboAntes = b;
  if (!novo || !snes) return;
  const sel = b & 0x2000;
  if (sel && (novo & 0x1000)) { if (rapidoAberto) fecharRapido(); else if ($('#biblioteca').hidden) abrirRapido(); return; }
  if (rapidoAberto) {
    const ir = (code) => rapidoTecla({ code, preventDefault() {} });
    if (novo & 0x0400) ir('ArrowDown');
    if (novo & 0x0800) ir('ArrowUp');
    if (novo & 0x0200) ir('ArrowLeft');
    if (novo & 0x0100) ir('ArrowRight');
    if (novo & 0x0080) ir('Enter');
    if (novo & 0x8000) fecharRapido();
    return;
  }
  if (!$('#biblioteca').hidden) return;
  if (sel && (novo & 0x0020)) salvarEstado();
  if (sel && (novo & 0x0010)) carregarUltimo();
}, 33);

// ---------------- pausa ao sair da janela ----------------
// só despausa na volta se quem pausou foi a saída (pausa manual continua)
let pausaAuto = ler('pausaAuto') !== '0', pausadoPorSair = false;
function sair() { if (pausaAuto && snes && !pausado) { pausado = true; pausadoPorSair = true; } }
function voltar() { if (pausadoPorSair) { pausadoPorSair = false; if (!rapidoAberto) { pausado = false; sobra = 0; } } }
addEventListener('blur', sair);
addEventListener('focus', voltar);
document.addEventListener('visibilitychange', () => { if (document.hidden) sair(); else voltar(); });

// ---------------- menu, temas e ações ----------------
function avisar(t, ms) {
  const a = $('#aviso'); a.textContent = t; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => { a.hidden = true; }, ms || 1800);
}
const TEMAS = [
  ['Clássicos do KOFnes', [['cafe', '☕ Café queimado'], ['escuro', '🌙 Escuro'], ['claro', '☀️ Claro'], ['zsnes', '🕹️ ZSNES']]],
  ['Consoles', [['super16', 'Super 16-bit'], ['portatil', 'Portátil verde'], ['atomico', 'Roxo atômico'], ['blast16', 'Blast 16'],
    ['cinza32', 'Cinza 32-bit'], ['branco', 'Branco console'], ['laminas', 'Verde lâminas'], ['neon', 'Fliperama neon']]],
  ['Computador e internet antiga', [['classico98', 'Clássico 98'], ['luna', 'Azul Luna'], ['mensageiro', 'Mensageiro'], ['rosa2004', 'Rede social 2004'],
    ['terminal', 'Terminal'], ['vapor', 'Vaporwave'], ['web1', 'Web 1.0']]],
  ['Anime', [['esferas', 'Esferas do dragão'], ['unidade01', 'Unidade 01'], ['lua', 'Guerreira da lua'], ['dourado', 'Cavaleiro dourado'],
    ['pokebola', 'Caçador de monstrinhos'], ['floresta', 'Floresta encantada']]],
  ['Bem brasileiro', [['desenho', 'Manhã de desenho'], ['camelo', 'Console de camelô'], ['brasil', 'Brasil']]],
];
const TODOS_TEMAS = TEMAS.flatMap(([, l]) => l);
// galeria (pop-up): passar o mouse (ou o foco das setas) experimenta o tema na
// janela toda; clicar escolhe; sair da galeria sem escolher volta ao de antes
let temaSalvo = 'cafe';
function experimentar(id) {
  document.documentElement.dataset.tema = id;
  const t = TODOS_TEMAS.find(([k]) => k === id);
  $('#tema-nome').textContent = t ? '· ' + t[1] + (id === temaSalvo ? ' (em uso)' : '') : '';
}
function montarTemas() {
  const g = $('#grade-temas'); g.innerHTML = '';
  for (const [grupo, lista] of TEMAS) {
    const h = document.createElement('h3'); h.textContent = grupo; g.appendChild(h);
    const d = document.createElement('div'); d.className = 'temas-grupo';
    for (const [id, nome] of lista) {
      const b = document.createElement('button'); b.className = 'previa'; b.dataset.tema = id; b.title = nome;
      b.innerHTML = '<span class="pv-barra"></span><span class="pv-corpo"><span class="pv-nome"></span><span class="pv-tela"></span><span class="pv-bot"></span></span>';
      b.querySelector('.pv-nome').textContent = nome;
      b.classList.toggle('ativo', temaSalvo === id);
      b.addEventListener('mouseenter', () => experimentar(id));
      b.addEventListener('focus', () => experimentar(id));
      d.appendChild(b);
    }
    g.appendChild(d);
  }
  experimentar(temaSalvo);
}
$('#grade-temas').addEventListener('mouseleave', () => {
  const f = document.activeElement;
  experimentar(f && f.classList.contains('previa') ? f.dataset.tema : temaSalvo);
});
$('#veu').addEventListener('click', () => acao('fechar-temas'));
function abrirTemas() {
  fecharJanelas(); montarTemas(); $('#temas').hidden = false; $('#veu').hidden = false;
  const b = $(`.previa[data-tema="${temaSalvo}"]`); if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
}
function fecharTemas() {
  if ($('#temas').hidden) return;
  $('#temas').hidden = true; $('#veu').hidden = true; experimentar(temaSalvo);
}
// setas andam pela grade: vai pro cartão mais perto naquela direção
function temasTecla(e) {
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.code];
  if (!dir) return false;
  e.preventDefault();
  const l = [...document.querySelectorAll('.previa')], at = l.includes(document.activeElement) ? document.activeElement : l[0];
  const c = (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const [x0, y0] = c(at);
  let melhor = null, dm = Infinity;
  for (const b of l) {
    if (b === at) continue;
    const [x, y] = c(b), dx = x - x0, dy = y - y0;
    const frente = dir[0] ? dx * dir[0] : dy * dir[1], lado = dir[0] ? Math.abs(dy) : Math.abs(dx);
    if (frente <= 5) continue;
    const d = frente + lado * 3;
    if (d < dm) { dm = d; melhor = b; }
  }
  if (melhor) { melhor.focus(); melhor.scrollIntoView({ block: 'nearest' }); }
  return true;
}
function tema(nome) {
  if (!TODOS_TEMAS.some(([k]) => k === nome)) nome = 'cafe';
  temaSalvo = nome;
  document.documentElement.dataset.tema = nome; guardar('tema', nome);
  document.querySelectorAll('[data-tema]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('ativo', b.dataset.tema === nome); });
}
async function acao(a) {
  fecharMenus();
  switch (a) {
    case 'abrir': $('#arquivo').click(); break;
    case 'pasta':
      if (!temPasta) { avisar('este navegador não deixa escolher pasta; use Adicionar arquivo', 4000); break; }
      try { pasta = await showDirectoryPicker({ id: 'kofnes-roms', mode: 'read' }); await bdPor('c', 'pasta', pasta); await mostrarBiblioteca(true); } catch (e) { /* cancelou */ }
      break;
    case 'biblioteca': await mostrarBiblioteca(true); break;
    case 'fechar-biblioteca': if (snes) fecharJanelas(); else avisar('escolha um jogo'); break;
    case 'jogar': await jogar(false); break;
    case 'auto-toggle':
      autoSalvar = !autoSalvar; guardar('autoSalvar', autoSalvar ? '1' : '0'); marcarAuto();
      avisar(autoSalvar ? 'salvar automático ligado' : 'salvar automático desligado'); break;
    case 'sofa': modoSofa(!sofa); await mostrarBiblioteca(true); break;
    case 'capas': capasNet = !capasNet; guardar('capas', capasNet ? '1' : '0'); $('[data-acao="capas"]').textContent = capasNet ? '🖼 Capas oficiais: ligadas' : '🖼 Capas oficiais: desligadas'; montarLista(); break;
    case 'do-zero': await jogar(true); break;
    case 'estados-do-sel': { const r = visiveis[selecionada]; await mostrarEstados(r && r.jogo ? r.jogo.id : jogoId); break; }
    case 'estados': await mostrarEstados(jogoId); break;
    case 'fechar-estados': $('#estados').hidden = true; if (!snes) mostrarBiblioteca(false); break;
    case 'salvar-estado': await salvarEstado(); break;
    case 'carregar-ultimo': await carregarUltimo(); break;
    case 'reiniciar': if (snes) { snes.reset(); novoRebob(); avisar('reiniciado'); } break;
    case 'pausar': if (snes) { pausado = !pausado; avisar(pausado ? 'pausado' : 'continuando'); } break;
    case 'mudo': mudo = !mudo; guardar('mudo', mudo ? '1' : '0'); marcarSom(); avisar(mudo ? 'som desligado' : 'som ligado'); break;
    case 'rebob-toggle':
      rebobLigado = !rebobLigado; guardar('rebobinar', rebobLigado ? '1' : '0'); novoRebob(); marcarRebob();
      avisar(rebobLigado ? 'rebobinar ligado: segure Backspace (ou Select+Y)' : 'rebobinar desligado'); break;
    case 'bug': abrirBug(); break;
    case 'bug-enviar': await enviarBug(); break;
    case 'bug-fechar': fecharBug(); break;
    case 'cacador-toggle':
      cacador = !cacador; guardar('cacador', cacador ? '1' : '0'); novoMarco(true); marcarCacador();
      avisar(cacador ? '🐞 caçador de bugs ligado: se o emulador quebrar, ele oferece reportar' : 'caçador de bugs desligado'); break;
    case 'vol-menos': mudarVolume(-10); break;
    case 'vol-mais': mudarVolume(10); break;
    case 'rapido': if (rapidoAberto) fecharRapido(); else if (snes) abrirRapido(); else avisar('abra um jogo primeiro'); break;
    case 'pausa-auto':
      pausaAuto = !pausaAuto; guardar('pausaAuto', pausaAuto ? '1' : '0'); marcarSom();
      avisar(pausaAuto ? 'pausa ao sair da janela ligada' : 'pausa ao sair da janela desligada'); break;
    case 'cheia': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
    case 'temas': if ($('#temas').hidden) abrirTemas(); else fecharTemas(); break;
    case 'fechar-temas': fecharTemas(); if (!snes) mostrarBiblioteca(false); break;
    case 'estatisticas': await mostrarEstat(); break;
    case 'fechar-estat': $('#estatisticas').hidden = true; if (!snes) mostrarBiblioteca(false); break;
    case 'controles': fecharJanelas(); montarAjuda(); $('#ajuda').hidden = false; break;
    case 'teclas': fecharJanelas(); montarGrade(); $('#teclas').hidden = false; break;
    case 'fechar-teclas': capturando = null; $('#teclas').hidden = true; if (!snes) mostrarBiblioteca(false); break;
    case 'teclas-padrao':
      mapa = {}; for (const [n, , padrao] of BOTOES_SNES) mapa[n] = padrao;
      guardar('teclas', JSON.stringify(mapa)); montarTeclas(); montarGrade(); montarAjuda(); avisar('teclas padrão restauradas');
      break;
    case 'fechar-ajuda': $('#ajuda').hidden = true; if (!snes) mostrarBiblioteca(false); break;
  }
}
function fecharMenus() { document.querySelectorAll('.m.aberto').forEach((m) => m.classList.remove('aberto')); }
document.querySelectorAll('#menu .m').forEach((m) => {
  const b0 = m.firstElementChild;
  if (b0.dataset.acao) { b0.addEventListener('click', (e) => { e.stopPropagation(); fecharMenus(); acao(b0.dataset.acao); }); return; }
  m.firstElementChild.addEventListener('click', (e) => { e.stopPropagation(); const ab = m.classList.contains('aberto'); fecharMenus(); if (!ab) m.classList.add('aberto'); });
  m.addEventListener('mouseenter', () => { if (document.querySelector('.m.aberto') && !m.classList.contains('aberto')) { fecharMenus(); m.classList.add('aberto'); } });
});
addEventListener('click', (e) => {
  ligarSom();
  const b = e.target.closest('button');
  if (!b) { if (!e.target.closest('.janela')) fecharMenus(); return; }
  if (b.dataset.acao) acao(b.dataset.acao);
  else if (b.dataset.escala) { escala = +b.dataset.escala; guardar('escala', escala); ajustarEscala(); fecharMenus(); }
  else if (b.dataset.tema && b.closest('#temas')) { tema(b.dataset.tema); fecharTemas(); avisar('🎨 tema: ' + TODOS_TEMAS.find(([k]) => k === temaSalvo)[1]); if (!snes) mostrarBiblioteca(false); }
  else if (b.dataset.filtro) { aplicarFiltro(b.dataset.filtro); fecharMenus(); }
  else if (b.dataset.prop) { mudarProporcao(b.dataset.prop); fecharMenus(); }
  else if (b.dataset.moldura) { mudarMoldura(b.dataset.moldura); fecharMenus(); }
});

document.body.classList.add('vazio');
carregarMapa();
montarAjuda();
tema(ler('tema') || 'cafe');
aplicarFiltro(filtro);
marcarAuto();
marcarSom();
marcarRebob();
marcarCacador();
document.body.classList.toggle('sofa', sofa);
$('[data-acao="capas"]').textContent = capasNet ? '🖼 Capas oficiais: ligadas' : '🖼 Capas oficiais: desligadas';
ajustarEscala();
if (!temPasta) document.querySelectorAll('[data-acao="pasta"]').forEach((b) => { b.hidden = true; });
mostrarBiblioteca(false);
window.KOFnes = { abrirArquivo, estado: () => ({ snes: !!snes, pausado, romNome, jogoId }), botoes: () => estado(), mapa: () => mapa, filtro: () => filtro, auto: () => autoSalvar, webgl: !!gl,
  // pros testes: lista falsa de n jogos (mede a biblioteca) e uma quebra de mentira no núcleo
  testeLista: (n) => { itens = Array.from({ length: n }, (_, i) => ({ nome: 'Jogo de teste ' + i, ext: 'SFC' })); $('#biblioteca').hidden = false; const t0 = performance.now(); montarLista(); const t1 = performance.now(); for (let k = 0; k < 30; k++) listaTecla({ code: 'ArrowDown', preventDefault() {}, target: null, key: '' }); return { montar: Math.round(t1 - t0), trintaSetas: Math.round(performance.now() - t1) }; },
  forcarErro: () => { const r = snes.runFrame; snes.runFrame = () => { snes.runFrame = r; throw new Error('quebra de teste'); }; },
  volume: () => volume, marcos: () => [!!marcoBugAnt, marcoBug ? marcoBug.entradas.length : -1], versao: VERSAO, rebob: () => rebob && { fotos: rebob.fotos, bytes: rebob.bytes }, moldura: () => moldura, estat: () => estat, tema: () => document.documentElement.dataset.tema, rapido: () => rapidoAberto, pausado: () => pausado, tamTela: () => [tela.clientWidth, tela.clientHeight],
  assinatura: () => { let t = 0; const f = snes.ppu.frame; for (let p = 0; p < 57344; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + snes.cpu.pc; } }; // pros testes
})();
