// Interface do KOFstation no navegador. O emulador em si é o núcleo Kof
// (snes/), compilado pra JavaScript: KofNucleo.Snes. Aqui fica só o que
// é de "janela": tela, som, teclado/controle, ROMs, saves e temas.
(() => {
'use strict';
const $ = (s) => document.querySelector(s);
let QUADRO_MS = 1000 / 60.0988;   // muda com o sistema (Game Boy: 59,73 quadros por segundo)
const guardar = (k, v) => { try { localStorage.setItem('kofnes.' + k, v); } catch (e) { /* sem armazenamento */ } };
const ler = (k) => { try { return localStorage.getItem('kofnes.' + k); } catch (e) { return null; } };

let snes = null, romNome = '', pausado = false, mudo = ler('mudo') === '1';
let escala = +(ler('escala') || 0), chaveSram = '', sramAntes = '';

// ---------------- tela ----------------
// O quadro do núcleo vai pra uma textura do tamanho da tela do sistema (SNES 256x224, Game Boy 160x144) e a placa de vídeo (WebGL)
// desenha com o filtro escolhido. Sem WebGL, volta pro canvas 2D (só nítido).
const FILTROS = [
  ['nitido', 'Nítido'], ['suave', 'Suave'], ['crt', 'TV de tubo (CRT)'], ['fliperama', 'Fliperama'],
  ['gameboy', 'Game Boy'], ['cafe', 'Café (sépia)'], ['lcd', 'Tela LCD'],
];
const tela = $('#tela');
// sistemas que esta versão roda (nucleo.js diz quais núcleos vieram no html); sem ele, só SNES
const SIS = typeof KofLibretro !== 'undefined' ? KofLibretro.SISTEMAS : { snes: { nome: 'Super Nintendo', curto: 'SNES', ext: ['sfc', 'smc', 'fig', 'swc'], minimo: 0x8000 } };
const SIS_ATIVOS = Object.keys(SIS).filter((k) => k === 'snes' || (typeof KofLibretro !== 'undefined' && KofLibretro.disponivel(k)));
const EXT_ROM = new RegExp('\\.(' + [].concat(...SIS_ATIVOS.map((k) => SIS[k].ext)).join('|') + ')$', 'i');
const sistemaDoNome = (n) => SIS_ATIVOS.find((k) => SIS[k].ext.some((e) => (n || '').toLowerCase().endsWith('.' + e))) || null;
const sistemaDoItem = (r) => (r.jogo && (r.jogo.sistema || sistemaDoNome(r.jogo.arquivo))) || sistemaDoNome(r.nome) || 'snes';
$('#arquivo').accept = [].concat(...SIS_ATIVOS.map((k) => SIS[k].ext)).map((e) => '.' + e).join(',') + ',.zip';
let telaL = 256, telaA = 224, img = new ImageData(telaL, telaA), px = new Uint32Array(img.data.buffer), bytesTela = new Uint8Array(img.data.buffer);
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
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, telaL, telaA, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  glModo = gl.getUniformLocation(prog, 'modo'); glTam = gl.getUniformLocation(prog, 'tam'); glSaida = gl.getUniformLocation(prog, 'saida');
  gl.uniform2f(glTam, telaL, telaA);
}
// jogo de outro sistema: imagem, textura e canvas mudam de tamanho
function tamanhoTela(l, a) {
  if (l === telaL && a === telaA) return;
  telaL = l; telaA = a;
  img = new ImageData(l, a); px = new Uint32Array(img.data.buffer); bytesTela = new Uint8Array(img.data.buffer);
  if (gl) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, l, a, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.uniform2f(glTam, l, a); }
}
function pintar() {
  if (!gl) { ctx.putImageData(img, 0, 0); return; }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, telaL, telaA, gl.RGBA, gl.UNSIGNED_BYTE, bytesTela);
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
  if (snes.rgba) { px.set(snes.rgba); pintar(); return; }   // núcleo libretro: já vem no formato da textura
  const f = snes.ppu.frame;
  // o núcleo Kof entrega 0xAARRGGBB; a textura (little-endian) quer 0xAABBGGRR
  for (let i = 0; i < px.length; i++) {
    const c = f[i];
    px[i] = 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
  }
  pintar();
}
// proporção: 4:3 é como aparecia na TV (o pixel do SNES não é quadrado); 8:7 é o pixel quadrado (256x224);
// esticar ocupa o palco inteiro. Em outro sistema, "original" é a proporção que o núcleo informa (Game Boy: 10:9)
const PROPORCOES = [['43', '4:3 (como na TV)'], ['87', 'Pixel perfeito (8:7)'], ['esticar', 'Esticar']];
const naTv = () => !snes || !snes.lr || snes.sistema === 'snes' || !!(SIS[snes.sistema] && SIS[snes.sistema].tv43);   // console de TV: 4:3
const RAZAO = { 43: () => (naTv() ? 4 / 3 : snes.proporcao || telaL / telaA), 87: () => telaL / telaA };
const nomeProporcao = (k) => (naTv() ? null : { 43: 'Original (como no aparelho)', 87: 'Pixel perfeito' }[k]) || PROPORCOES.find(([c]) => c === k)[1];
let proporcao = PROPORCOES.some(([k]) => k === ler('proporcao')) ? ler('proporcao') : '43';
// moldura em volta do jogo; as bordas são frações da altura da tela (cima, direita, baixo, esquerda)
const MOLDURAS = [['nenhuma', 'Sem moldura'], ['tv80', 'TV de madeira (anos 80)'], ['tv90', 'TV de tubo (anos 90)'], ['fliperama', 'Fliperama']];
const BORDAS = { nenhuma: [0, 0, 0, 0], tv80: [0.1, 0.44, 0.1, 0.1], tv90: [0.08, 0.08, 0.2, 0.08], fliperama: [0.3, 0.12, 0.34, 0.12] };
let moldura = BORDAS[ler('moldura')] ? ler('moldura') : 'nenhuma';
function mudarMoldura(v) { moldura = BORDAS[v] ? v : 'nenhuma'; guardar('moldura', moldura); ajustarEscala(); }
function ajustarEscala() {
  const p = $('#palco'), cheia = document.body.classList.contains('cheia') || document.documentElement.classList.contains('celular'), folga = cheia ? 0 : 16;   // celular: sempre o maior que couber (sem múltiplo inteiro)
  const pc = getComputedStyle(p), miolo = (l, r) => (parseFloat(pc[l]) || 0) + (parseFloat(pc[r]) || 0);   // celular na horizontal: o palco tem folga dos lados pros botões
  const W = Math.max(telaL, p.clientWidth - folga - miolo('paddingLeft', 'paddingRight')), H = Math.max(telaA, p.clientHeight - folga - miolo('paddingTop', 'paddingBottom'));
  const [bc, bd, bb, be] = BORDAS[moldura], comMoldura = moldura !== 'nenhuma';
  let w, h;
  if (proporcao === 'esticar') { h = H / (1 + bc + bb); w = W - (bd + be) * h; } else {
    const r = RAZAO[proporcao](), hMax = Math.min(H / (1 + bc + bb), W / (r + bd + be));
    if (cheia || comMoldura) h = hMax;                         // tela cheia ou moldura: o maior que couber
    else {
      const maxE = Math.max(1, Math.floor(hMax / telaA));
      h = telaA * (escala ? Math.min(escala, maxE) : maxE);       // na janela: múltiplo inteiro
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
  } else { tela.width = telaL; tela.height = telaA; }
  document.querySelectorAll('[data-escala]').forEach((b) => b.classList.toggle('ativo', +b.dataset.escala === escala));
  document.querySelectorAll('[data-prop]').forEach((b) => b.classList.toggle('ativo', b.dataset.prop === proporcao));
  document.querySelectorAll('[data-moldura]').forEach((b) => { if (b.tagName === 'BUTTON') b.classList.toggle('ativo', b.dataset.moldura === moldura); });
}
// paleta dos jogos do Game Boy original (os de Game Boy Color têm cor própria): automática = as cores que o Game Boy
// Color dava pra cada cartucho antigo; verde = a tela do Game Boy de 1989; cinza = Game Boy Pocket
const PALETAS_GB = [['auto', 'Cores do Game Boy Color'], ['verde', 'Verde (o original)'], ['cinza', 'Cinza (Pocket)']];
const OPCOES_PALETA = { auto: { gambatte_gb_colorization: 'auto', gambatte_gb_internal_palette: 'GBC - Dark Green' }, verde: { gambatte_gb_colorization: 'internal', gambatte_gb_internal_palette: 'GB - DMG' }, cinza: { gambatte_gb_colorization: 'disabled' } };
let paletaGb = OPCOES_PALETA[ler('paletaGb')] ? ler('paletaGb') : 'auto';
function mudarPaletaGb(v) {
  paletaGb = OPCOES_PALETA[v] ? v : 'auto'; guardar('paletaGb', paletaGb);
  if (typeof KofLibretro !== 'undefined') KofLibretro.opcao('gambatte', OPCOES_PALETA[paletaGb]);
  document.querySelectorAll('[data-paleta-gb]').forEach((b) => b.classList.toggle('ativo', b.dataset.paletaGb === paletaGb));
}
mudarPaletaGb(paletaGb);
// NES: cada TV mostrava as cores de um jeito; padrão = a do FCEUX
const PALETAS_NES = [['default', 'Padrão'], ['composite-direct-fbx', 'TV de tubo'], ['wavebeam', 'Viva']];
let paletaNes = PALETAS_NES.some(([k]) => k === ler('paletaNes')) ? ler('paletaNes') : 'default';
function mudarPaletaNes(v) {
  paletaNes = PALETAS_NES.some(([k]) => k === v) ? v : 'default'; guardar('paletaNes', paletaNes);
  if (typeof KofLibretro !== 'undefined') KofLibretro.opcao('fceumm', { fceumm_palette: paletaNes });
  document.querySelectorAll('[data-paleta-nes]').forEach((b) => b.classList.toggle('ativo', b.dataset.paletaNes === paletaNes));
}
mudarPaletaNes(paletaNes);
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
    taxa = 32000 / audio.sampleRate;   // recalculado a cada bloco: o núcleo (ou a jukebox) diz a taxa dele
    no = audio.createScriptProcessor(2048, 0, 2);
    let pos = 0;
    no.onaudioprocess = (ev) => {
      const l = ev.outputBuffer.getChannelData(0), r = ev.outputBuffer.getChannelData(1);
      const jk = juke.tocando;
      taxa = (jk ? juke.apu.taxa : !snes || !snes.taxaAudio ? 32000 : snes.taxaAudio) / audio.sampleRate;
      if (jk) jukeEncher(Math.ceil(l.length * taxa) + 64);
      for (let i = 0; i < l.length; i++) {
        if (ini === fim || mudo || (pausado && !jk)) { l[i] = r[i] = 0; continue; }
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
// o mudo fica guardado entre as aberturas e o único sinal era o "mudo" no menu Som: parecia que o
// som tinha quebrado. Avisa ao abrir um jogo (depois dos avisos de "continuando de...") e no play da jukebox
function avisarMudo(atraso) {
  setTimeout(() => { if (mudo) avisar('🔇 o som está desligado: aperte M pra ligar', 4000); }, atraso || 0);
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
  const cheio = ((fim - ini) & (FILA - 1)) > (snes.taxaAudio || 32000) * 0.15; // > 150 ms: descarta
  if (audio && !cheio) {
    for (let i = 0; i + 1 < n; i += 2) {
      fila[fim * 2] = b[i] / 32768; fila[fim * 2 + 1] = b[i + 1] / 32768;
      fim = (fim + 1) & (FILA - 1);
    }
  }
  d.outCount = 0;
}

// celular: o KOFnes-android.html liga esta classe (controle virtual na tela, núcleos libretro, sem textos de teclado)
const CELULAR = document.documentElement.classList.contains('celular');

// ---------------- controles ----------------
// botões do SNES: nome, bit no registrador do controle e tecla padrão
const BOTOES_SNES = [
  ['Cima', 0x0800, 'ArrowUp'], ['Baixo', 0x0400, 'ArrowDown'],
  ['Esquerda', 0x0200, 'ArrowLeft'], ['Direita', 0x0100, 'ArrowRight'],
  ['B', 0x8000, 'KeyZ'], ['A', 0x0080, 'KeyX'], ['Y', 0x4000, 'KeyA'], ['X', 0x0040, 'KeyS'],
  ['L', 0x0020, 'KeyQ'], ['R', 0x0010, 'KeyW'], ['Start', 0x1000, 'Enter'], ['Select', 0x2000, 'ShiftLeft'],
];
// atalhos do emulador: não podem virar botão do jogo
const RESERVADAS = ['Escape', 'Tab', 'Backspace', 'F7', 'F9', 'F1', 'F2', 'F5', 'F6', 'F8', 'F11', 'KeyP', 'KeyM', 'Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd'];
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
    ['Menu rápido', 'Select+Start · F2', 'Menu rápido', 'botão direito do mouse'],
    ['', '', 'Volume', '- / ='],
    ['Salvar · carregar', 'Select+L · Select+R', 'Sair da tela cheia', 'Esc'],
    ['Rebobinar (segurar)', 'Select+Y', 'Rebobinar (segurar)', 'Backspace'],
    ['', '', 'Reportar bug', 'F9'],
    ['', '', 'Guardar a música (jukebox)', 'F7'],
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
let toque = 0;   // botões apertados na tela de toque (celular)
function estado() {
  let b = teclado | toque;
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
  if (showTimer && e.code === 'Escape') { e.preventDefault(); pararShowcase(false); return; }
  if (!$('#bug').hidden) { if (e.code === 'Escape') fecharBug(); return; }   // digitando a descrição
  if (rapidoAberto) { rapidoTecla(e); return; }
  if (e.code === 'F9') { e.preventDefault(); abrirBug(); return; }
  if (e.code === 'F7') { e.preventDefault(); guardarMusica(); return; }
  if (!$('#jukebox').hidden && e.code === 'Space') { e.preventDefault(); jukeAlternar(); return; }
  if (!$('#temas').hidden) {
    const busca = $('#temas-busca'), emBusca = document.activeElement === busca;
    if (e.code === 'Escape') {
      if (emBusca && busca.value) { busca.value = ''; temasBusca = ''; montarTemas(); return; }   // 1º Esc limpa a busca, o 2º fecha
      acao('fechar-temas'); return;
    }
    if (emBusca) {   // digitando: ↓ vai pros temas, Enter escolhe o primeiro; o resto é texto
      if (e.code === 'ArrowDown') { e.preventDefault(); const p = $('#grade-temas .previa'); if (p) p.focus(); }
      else if (e.code === 'Enter') { e.preventDefault(); const p = $('#grade-temas .previa'); if (p) p.click(); }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.code !== 'Space') { busca.focus(); return; }   // começou a digitar: vai pra busca
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
  if (e.altKey && e.code === 'ArrowLeft') { e.preventDefault(); voltar(); return; }
  if (e.code === 'BrowserBack') { e.preventDefault(); voltar(); return; }
  if (!$('#biblioteca').hidden) { listaTecla(e); return; }
  if (e.code === 'Home' && !e.target.closest('input, textarea')) { e.preventDefault(); acao('home'); return; }
  if (!$('#home').hidden) { if (homeTecla(e)) return; }
  const aberta = ['estados', 'guia', 'teclas', 'temas', 'estatisticas', 'jukebox'].some((id) => !$('#' + id).hidden);
  if (e.code === 'Escape' && aberta) { sairDaTela(); return; }
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
  const querVoltar = snes && voltando() && !pausado && !rapidoAberto && $('#biblioteca').hidden && $('#bug').hidden && $('#home').hidden;
  if (querVoltar && rebob && (rebobinou || rebobPronto())) { rebobinarPasso(); ultimo = marco = t; contados = 0; return; }
  if (rebobinou) terminarRebobinar();
  if (querVoltar && rebob && rebobRecarga > 0) avisar('⏳ rebobinar recarregando: ' + Math.ceil(rebobRecarga / 60) + ' s de jogo', 900);
  if (!snes || pausado || !$('#biblioteca').hidden || !$('#estados').hidden || !$('#jukebox').hidden || !$('#home').hidden || !$('#guia').hidden) { ultimo = marco = t; contados = 0; return; }
  if (juke.tocando) jukePausar();
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
  if (rebobRecarga > 0) {
    rebobRecarga -= vezes;
    if (rebobRecarga <= 0) { rebobRecarga = 0; avisar('⏳ rebobinar pronto', 1500); }
    marcarAmpulheta();
  }
  contados += vezes;
  if (t - marco >= 1000) {
    $('#st-fps').textContent = (pausado ? 'pausado · ' : '') + Math.round(contados * 1000 / (t - marco)) + ' fps';
    contados = 0; marco = t; salvarSram();
  }
}
requestAnimationFrame(laco);

// ---------------- jukebox ----------------
// A música do SNES roda num computador à parte (SPC700 + DSP + 64 KB). Guardar
// uma música = fotografar só esse chip; tocar = rodar só ele, sem CPU nem
// imagem, num Apu avulso do núcleo. Também abre e exporta arquivos .spc.
// Game Boy (e outros sistemas libretro): guardar = savestate do jogo; tocar = restaurar numa instância à parte do
// núcleo e deixar rodar sem imagem e sem botão (o jogo fica parado naquela tela e a música segue). A ROM vem da biblioteca.
// juke.apu é o "tocador": encher() devolve um pedaço de áudio, onda(v) a forma de onda do canal v (osciloscópio),
// mudas(m) silencia canais. juke.solo: canal tocando sozinho (-1 = nenhum)
const juke = { lista: [], atual: -1, apu: null, tocando: false, amostras: 0, aleatorio: false, repetir: false, mudas: 0, solo: -1 };
const PADRAO_SEG = 180, PADRAO_FADE = 8000;
const CANAIS_SNES = ['Voz 1', 'Voz 2', 'Voz 3', 'Voz 4', 'Voz 5', 'Voz 6', 'Voz 7', 'Voz 8'];
function tocadorSnes(apu) {
  const d = apu.dsp; d.sonda = true;
  return {
    sis: 'snes', canais: 8, nomes: CANAIS_SNES, papeis: [], taxa: 32000, apu,
    encher() { apu.run(32 * 256); return { b: d.outBuf, n: d.outCount }; },   // 256 amostras (32 ciclos do SPC700 por amostra)
    limpar() { d.outCount = 0; },
    mudas(m) { d.mudas = m; },
    onda(v) { return { buf: d.onda, base: v << 11, tam: 2048, pos: d.ondaPos, escala: 1 / 16384 }; },
    nivel(v) { return d.regs[v * 16 + 8] / 127; },   // envelope (ENVX) da voz
    fechar() {},
  };
}
const mudasEfetivas = () => (juke.solo >= 0 ? ~(1 << juke.solo) & 0xFF : juke.mudas);
function aplicarMudas() { if (juke.apu) juke.apu.mudas(mudasEfetivas()); }
function jukeEncher(precisa) {
  let voltas = 0;
  const tk = juke.apu, taxaJ = tk.taxa;
  while (((fim - ini) & (FILA - 1)) < precisa && voltas++ < 64) {
    const { b, n } = tk.encher();
    const f = juke.lista[juke.atual] || {}, seg = juke.repetir ? 0 : (f.segundos || PADRAO_SEG), fade = f.fadeMs || PADRAO_FADE;
    for (let i = 0; i + 1 < n; i += 2) {
      let k = 1;
      if (seg) {
        const t = juke.amostras / taxaJ;
        if (t > seg) k = Math.max(0, 1 - (t - seg) * 1000 / fade);
      }
      fila[fim * 2] = b[i] / 32768 * k; fila[fim * 2 + 1] = b[i + 1] / 32768 * k;
      fim = (fim + 1) & (FILA - 1); juke.amostras++;
    }
    tk.limpar();
    if (seg && juke.amostras / taxaJ > seg + fade / 1000 && !jukeEncher.trocando) {
      jukeEncher.trocando = true; setTimeout(() => { jukeEncher.trocando = false; jukeProxima(1); }, 0); break;
    }
  }
}
async function jukeCarregar() {
  try { juke.lista = (await bdTodos('musicas')).sort((a, b) => (a.jogo || '').localeCompare(b.jogo || '', 'pt-BR') || a.quando - b.quando); } catch (e) { juke.lista = []; }
}
async function jukeTocar(i) {
  const f = juke.lista[i];
  if (!f) return;
  try {
    let tk;
    if (f.sistema && f.sistema !== 'snes') {
      if (typeof KofLibretro === 'undefined' || !KofLibretro.disponivel(f.sistema)) throw new Error('essa versão do KOFstation não toca música de ' + (SIS[f.sistema] ? SIS[f.sistema].nome : f.sistema));
      const rom = await bdPegar('roms', f.jogoId);
      if (!rom) throw new Error('a ROM de ' + f.jogo + ' não está mais na biblioteca: abra o jogo uma vez e tente de novo');
      tk = await KofLibretro.tocador(f.sistema, rom, f.lr);
    } else {
      const apu = new KofNucleo.Apu(); apu.reset();
      if (f.estado) KofEstado.restaurar(apu, JSON.parse(f.estado)); else KofSpc.ler(apu, f.spc);
      apu.dsp.outCount = 0;
      tk = tocadorSnes(apu);
    }
    if (juke.apu && juke.apu !== tk) juke.apu.fechar();
    if (!juke.apu || juke.apu.canais !== tk.canais) { juke.mudas = 0; juke.solo = -1; }   // mudou de sistema: canais novos
    juke.apu = tk; juke.atual = i; juke.amostras = 0;
    aplicarMudas();
  } catch (e) { avisar('não consegui tocar: ' + e.message, 4000); return; }
  if (snes && !pausado) pausado = true;             // o jogo espera; P volta pro jogo
  ini = fim = 0; juke.tocando = true; ligarSom(); avisarMudo();
  montarJuke();
}
function jukePausar() { juke.tocando = false; ini = fim = 0; montarJuke(); }
function jukeAlternar() {
  if (juke.tocando) jukePausar();
  else if (juke.apu) { if (snes && !pausado) pausado = true; juke.tocando = true; ligarSom(); avisarMudo(); montarJuke(); }
  else if (juke.lista.length) jukeTocar(0);
}
function jukeProxima(d) {
  const n = juke.lista.length;
  if (!n) return;
  const i = juke.aleatorio ? Math.floor(Math.random() * n) : (juke.atual + d + n) % n;
  jukeTocar(i);
}
function jukeFechar() { juke.tocando = false; if (juke.apu) juke.apu.fechar(); juke.apu = null; juke.atual = -1; ini = fim = 0; montarJuke(); }
async function guardarMusica() {
  if (!snes) { avisar('abra um jogo pra guardar a música dele'); return; }
  try {
    const n = juke.lista.filter((f) => f.jogoId === jogoId).length + 1;
    const reg = { origem: 'jogo', titulo: `Faixa ${n}`, jogo: romNome, jogoId, quando: Date.now(), capa: foto(256) };
    // núcleo Kof: o estado do chip de som inteiro; núcleo Snes9x (celular): um .spc tirado do estado dele;
    // outros sistemas (Game Boy): o savestate do jogo inteiro (a jukebox roda o jogo parado naquela tela)
    if (snes.lr && !snes.s9x) { reg.sistema = snes.sistema; reg.lr = KofEstado.capturar(snes).d; } else if (snes.s9x) reg.spc = snes.gravarSpc({ titulo: reg.titulo, jogo: romNome, segundos: PADRAO_SEG, fadeMs: PADRAO_FADE }); else reg.estado = JSON.stringify(KofEstado.capturar(snes.apu));
    await bdGuardar('musicas', reg);
    await jukeCarregar(); montarJuke();
    avisar(`🎵 música guardada na jukebox: ${romNome} · Faixa ${n} (Som → Jukebox)`, 3500);
  } catch (e) { avisar('não consegui guardar a música: ' + e.message, 4000); }
}
async function importarSpcs(arqs) {
  let ok = 0;
  for (const a of arqs) {
    try {
      const u8 = new Uint8Array(await a.arrayBuffer());
      if (!KofSpc.eSpc(u8)) continue;
      const t = KofSpc.etiquetas(u8);
      await bdGuardar('musicas', { origem: 'spc', titulo: t.titulo || a.name.replace(/\.spc$/i, ''), jogo: t.jogo || 'Arquivos .spc', artista: t.artista, segundos: t.segundos, fadeMs: t.fadeMs, quando: Date.now(), spc: u8 });
      ok++;
    } catch (e) { /* arquivo ruim: pula */ }
  }
  await jukeCarregar();
  avisar(ok ? `🎵 ${ok} ${ok === 1 ? 'música entrou' : 'músicas entraram'} na jukebox` : 'nenhum .spc válido', 3000);
  abrirJuke();
}
async function exportarSpc(f) {
  const apu = new KofNucleo.Apu(); apu.reset();
  let u8 = f.spc;
  if (!u8) { KofEstado.restaurar(apu, JSON.parse(f.estado)); u8 = KofSpc.gravar(apu, { titulo: f.titulo, jogo: f.jogo, artista: f.artista, segundos: f.segundos || PADRAO_SEG, fadeMs: f.fadeMs || PADRAO_FADE }); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = `${f.jogo} - ${f.titulo}.spc`.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
async function abrirJuke() {
  fecharJanelas(); fecharMenus(); await jukeCarregar(); $('#jukebox').hidden = false; montarJuke(); requestAnimationFrame(desenharVozes);
}
function montarJuke() {
  const f = juke.lista[juke.atual];
  // mini-player na barra de baixo
  $('#st-juke').hidden = !juke.apu || !$('#jukebox').hidden;
  if (f) $('#st-juke-nome').textContent = `🎵 ${f.titulo} · ${f.jogo}`;
  $('#st-juke-tocar').textContent = juke.tocando ? '⏸' : '▶';
  if ($('#jukebox').hidden) return;
  $('#jk-titulo').textContent = f ? f.titulo : 'Nada tocando';
  $('#jk-jogo').textContent = f ? [f.jogo, f.artista].filter(Boolean).join(' · ') : (juke.lista.length ? 'escolha uma música' : (CELULAR ? 'guarde uma música no jogo (☰) ou abra arquivos .spc' : 'guarde uma música no jogo (F7) ou abra arquivos .spc'));
  const capa = f ? (srcCapa({ nome: f.jogo }) || f.capa || '') : '';
  $('#jk-capa').hidden = !capa; $('.jk-capa span').hidden = !!capa; if (capa) $('#jk-capa').src = capa;
  if (f) { if (f.sistema && !capaSis.has(f.jogo)) capaSis.set(f.jogo, f.sistema); capaPorNome(f.jogo).catch(() => {}); }
  $('[data-acao="jk-tocar"]').textContent = juke.tocando ? '⏸' : '▶';
  $('[data-acao="jk-aleatorio"]').classList.toggle('ativo', juke.aleatorio);
  $('[data-acao="jk-repetir"]').classList.toggle('ativo', juke.repetir);
  const ul = $('#jk-lista'); ul.innerHTML = '';
  let grupo = null;
  juke.lista.forEach((m, i) => {
    if (m.jogo !== grupo) { grupo = m.jogo; const h = document.createElement('li'); h.className = 'jk-grupo'; h.textContent = grupo; ul.appendChild(h); }
    const li = document.createElement('li'); li.className = 'jk-faixa' + (i === juke.atual ? ' sel' : '');
    const nm = document.createElement('span'); nm.textContent = (i === juke.atual && juke.tocando ? '♪ ' : '') + m.titulo;
    const dur = document.createElement('small'); dur.textContent = m.origem === 'spc' ? (m.segundos ? mmss(m.segundos) : '.spc') : 'do jogo' + (m.sistema && m.sistema !== 'snes' && SIS[m.sistema] ? ' · ' + SIS[m.sistema].curto : '');
    const bts = document.createElement('span'); bts.className = 'jk-acoes';
    const bt = (txt, tit, fn) => { const b = document.createElement('button'); b.className = 'x'; b.textContent = txt; b.title = tit; b.onclick = (e) => { e.stopPropagation(); fn(); }; bts.appendChild(b); };
    bt('✎', 'renomear', async () => {
      const t = prompt('Nome da música:', m.titulo); if (!t) return;
      m.titulo = t.trim(); await bdGuardar('musicas', m); montarJuke();
    });
    if (!m.sistema || m.sistema === 'snes') bt('⬇', 'exportar .spc', () => exportarSpc(m));
    bt('🗑', 'apagar', async () => {
      if (!confirm(`Apagar "${m.titulo}" da jukebox?`)) return;
      if (i === juke.atual) jukeFechar();
      await bdApagar('musicas', m.n); await jukeCarregar(); montarJuke();
    });
    li.append(nm, dur, bts); li.onclick = () => jukeTocar(i);
    ul.appendChild(li);
  });
  $('#jk-vazia').hidden = juke.lista.length > 0;
  // canais do chip de som da música atual: 8 vozes no SNES, 4 canais no Game Boy
  const nomes = juke.apu ? juke.apu.nomes : (f && f.sistema && SIS[f.sistema] && SIS[f.sistema].canais) || CANAIS_SNES;
  const vz = $('#jk-vozes'), snesV = nomes === CANAIS_SNES || nomes.length === 8;
  if (vz.dataset.nomes !== nomes.join()) {
    vz.dataset.nomes = nomes.join(); vz.textContent = ''; vz.style.gridTemplateColumns = `repeat(${nomes.length}, 1fr)`;
    nomes.forEach((nm, v) => {
      const b = document.createElement('button'); b.className = 'jk-voz'; b.dataset.voz = v; b.title = nm + ': clique pra silenciar';
      b.innerHTML = '<i></i><span>' + (snesV ? v + 1 : nm) + '</span>'; vz.appendChild(b);
    });
    $('#jk-vozes-dica').firstChild.textContent = snesV ? 'as 8 vozes do chip de som · ' : `os ${nomes.length} canais do chip de som · `;
    montarOndas(nomes);
  }
  const m = mudasEfetivas();
  [...vz.children].forEach((b, v) => b.classList.toggle('muda', (m & (1 << v)) !== 0));
  marcarOndas();
}
// ---------- osciloscópio (modo "Ondas" da jukebox) ----------
// uma faixa por canal com a forma da onda parada (gatilho na subida), no estilo do tema; Mudo e Solo em cada faixa
let jkVista = ler('jkVista') === 'ondas' ? 'ondas' : 'capa', jkEstilo = ler('jkEstilo') || '';
const ESTILO_TEMA = { portatil: 'pixel', terminal: 'neon', neon: 'neon', vapor: 'neon', cinza32: 'pixel', zsnes: 'pixel', super16: 'pixel', latte: 'preenchido', claro: 'preenchido', branco: 'preenchido', cappuccino: 'preenchido', cafe: 'fio', espresso: 'fio' };
function estiloOndas() {
  if (jkEstilo) return jkEstilo;
  if (ESTILO_TEMA[temaSalvo]) return ESTILO_TEMA[temaSalvo];
  const [, , l] = hslDe(getComputedStyle(document.documentElement).getPropertyValue('--fundo').trim());
  return l > 55 ? 'preenchido' : 'fio';   // tema claro: área preenchida; escuro: fio
}
function hslDe(cor) {
  const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(cor) || /#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(cor);
  if (!m) return [0, 0, 50];
  const [r, g, b] = [1, 2, 3].map((k) => parseInt(m[k].length === 1 ? m[k] + m[k] : m[k], 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, sat = 0;
  if (d) { sat = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [(h + 360) % 360, sat * 100, l * 100];
}
let ondasFaixas = [];
function montarOndas(nomes) {
  const el = $('#jk-ondas'); el.textContent = '';
  const papeis = juke.apu ? juke.apu.papeis : [];
  ondasFaixas = nomes.map((nm, v) => {
    const d = document.createElement('div'); d.className = 'jk-canal';
    d.innerHTML = '<canvas></canvas><div class="jk-canal-rot"><b></b><span></span></div><div class="jk-canal-acoes"><button data-m="mudo" title="silenciar só este canal">🔇 Mudo</button><button data-m="solo" title="ouvir só este canal">🎧 Solo</button></div>';
    d.querySelector('b').textContent = nm; d.querySelector('.jk-canal-rot span').textContent = papeis[v] || '';
    d.querySelector('[data-m="mudo"]').onclick = () => { juke.mudas ^= 1 << v; if (juke.solo === v) juke.solo = -1; aplicarMudas(); montarJuke(); };
    d.querySelector('[data-m="solo"]').onclick = () => { juke.solo = juke.solo === v ? -1 : v; aplicarMudas(); montarJuke(); };
    el.appendChild(d);
    return { el: d, cv: d.querySelector('canvas'), v };
  });
  el.classList.toggle('poucos', nomes.length <= 4);
  coresOndas();
}
let coresCanal = [], corFraca = '#888', corBorda = '#444';
function coresOndas() {
  const cs = getComputedStyle(document.documentElement), g = (k) => cs.getPropertyValue(k).trim();
  const [h, sat, l] = hslDe(g('--destaque')), n = ondasFaixas.length || 8, mono = sat < 25 || estiloOndas() === 'pixel';
  corFraca = g('--fraco') || '#888'; corBorda = g('--borda') || '#444';
  coresCanal = Array.from({ length: n }, (_, i) => (mono ? g('--destaque') : `hsl(${(h + (i - n / 2) * (n > 4 ? 22 : 40) + 360) % 360} ${Math.max(45, sat)}% ${Math.min(Math.max(l, 45), 70)}%)`));
}
function marcarOndas() {
  const jk = $('#jukebox .jk'), ondas = jkVista === 'ondas';
  jk.classList.toggle('ondas', ondas); $('#jk-ondas').hidden = !ondas;
  document.querySelectorAll('[data-acao^="jk-vista-"]').forEach((b) => b.classList.toggle('ativo', b.dataset.acao === 'jk-vista-' + jkVista));
  $('#jk-estilo').value = jkEstilo;
  const m = mudasEfetivas();
  ondasFaixas.forEach((c) => {
    const ouvindo = !(m & (1 << c.v));
    c.ouvindo = ouvindo;
    c.el.classList.toggle('apagado', !ouvindo); c.el.classList.toggle('solo', juke.solo === c.v);
    c.el.querySelector('[data-m="mudo"]').classList.toggle('ativo', !!(juke.mudas & (1 << c.v)));
    c.el.querySelector('[data-m="solo"]').classList.toggle('ativo', juke.solo === c.v);
  });
}
function mudarVistaJuke(v) { jkVista = v; guardar('jkVista', v); marcarOndas(); }
function desenharOndas() {
  const tk = juke.apu, est = estiloOndas(), dpr = window.devicePixelRatio || 1;
  for (const c of ondasFaixas) {
    const cv = c.cv, W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) continue;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'), meio = H * 0.56, alt = H * 0.38;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = 0.3; g.strokeStyle = corBorda; g.lineWidth = dpr; g.beginPath(); g.moveTo(0, meio); g.lineTo(W, meio); g.stroke(); g.globalAlpha = 1;
    if (!tk || c.v >= tk.canais) continue;
    const o = tk.onda(c.v), N = Math.round(tk.taxa * 0.018), M = o.tam - 1;   // 18 ms de tela
    const at = (k) => o.buf[o.base + ((o.pos - 1 - k) & M)];                  // k amostras atrás da mais nova
    // média (tira o nível contínuo) e gatilho: a subida mais recente que deixe uma tela inteira pra frente
    let media = 0; for (let k = 0; k < N * 2; k++) media += at(k); media /= N * 2;
    let ini = N;
    for (let k = N; k < Math.min(M - 2, N * 3); k++) if (at(k + 1) < media && at(k) >= media) { ini = k; break; }
    const cols = est === 'pixel' ? 96 : Math.min(W, 480), ys = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      let y = (at(Math.max(0, ini - Math.round((i / cols) * (N - 1)))) - media) * o.escala;
      y = Math.max(-1.2, Math.min(1.2, y));
      if (est === 'pixel') y = Math.round(y * 7) / 7;
      ys[i] = meio - y * alt;
    }
    const cor = c.ouvindo === false ? corFraca : coresCanal[c.v] || corFraca;
    g.lineJoin = 'round';
    if (est === 'preenchido') {
      g.beginPath(); g.moveTo(0, meio);
      for (let i = 0; i <= cols; i++) g.lineTo((i / cols) * W, ys[i]);
      g.lineTo(W, meio); g.closePath(); g.globalAlpha = 0.3; g.fillStyle = cor; g.fill(); g.globalAlpha = 1;
    }
    if (est === 'neon') { g.shadowColor = cor; g.shadowBlur = 12 * dpr; }
    g.strokeStyle = cor; g.lineWidth = (est === 'fio' ? 1.6 : est === 'pixel' ? 3 : 2.2) * dpr;
    g.beginPath();
    if (est === 'pixel') {
      const bl = Math.max(2, Math.round(3 * dpr)), q = (y) => Math.round(y / bl) * bl;
      g.moveTo(0, q(ys[0]));
      for (let i = 1; i <= cols; i++) { const x = q((i / cols) * W); g.lineTo(x, q(ys[i - 1])); g.lineTo(x, q(ys[i])); }
    } else for (let i = 0; i <= cols; i++) { const x = (i / cols) * W; i ? g.lineTo(x, ys[i]) : g.moveTo(x, ys[i]); }
    g.stroke(); g.shadowBlur = 0;
  }
}
$('#jk-estilo').addEventListener('change', (e) => { jkEstilo = e.target.value; guardar('jkEstilo', jkEstilo); coresOndas(); });
// os canais ao vivo: no SNES a barra é o envelope (ENVX) de cada voz; nos outros, o pico da onda do canal
function nivelCanal(tk, v) {
  if (tk.nivel) return tk.nivel(v);
  const o = tk.onda(v), M = o.tam - 1; let mn = 1e9, mx = -1e9;
  for (let k = 0; k < 512; k++) { const x = o.buf[o.base + ((o.pos - 1 - k) & M)]; if (x < mn) mn = x; if (x > mx) mx = x; }
  return (mx - mn) * o.escala / 2;
}
function desenharVozes() {
  if ($('#jukebox').hidden) return;
  requestAnimationFrame(desenharVozes);
  const tk = juke.apu && juke.tocando ? juke.apu : null;
  if (jkVista === 'ondas') desenharOndas();
  else [...$('#jk-vozes').children].forEach((b, v) => { b.firstChild.style.height = (tk ? Math.min(100, nivelCanal(tk, v) * 100) : 0) + '%'; });
  const f = juke.lista[juke.atual], t = juke.amostras / (juke.apu ? juke.apu.taxa : 32000);
  $('#jk-tempo').textContent = f ? mmss(t) + (juke.repetir ? ' · repetindo' : ' / ' + mmss((f.segundos || PADRAO_SEG) + (f.fadeMs || PADRAO_FADE) / 1000)) : '';
}
$('#jk-vozes').addEventListener('click', (e) => {
  const b = e.target.closest('.jk-voz'); if (!b) return;
  juke.mudas ^= 1 << +b.dataset.voz; juke.solo = -1;
  aplicarMudas();
  montarJuke();
});
$('#arquivo-spc').addEventListener('change', (e) => { if (e.target.files.length) importarSpcs([...e.target.files]); e.target.value = ''; });

// ---------------- caçador de bugs ----------------
// Pra reproduzir um bug exatamente: a cada 10 s o KOFstation tira uma foto do
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
  const aba = window.open('about:blank', '_blank');   // abre já, no toque: depois de um await o navegador (principalmente no celular) bloquearia a janela
  const desc = $('#bug-desc').value.trim() || '(sem descrição)', comPacote = $('#bug-pacote').checked && snes;
  const agora = new Date(), data = agora.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const jogo = snes ? { nome: romNome, titulo: snes.cart.title.trim(), tamanho: romAtual ? romAtual.length : 0, sha1: romAtual ? await sha1(romAtual) : '?', mapeamento: snes.lr ? SIS[snes.sistema].nome + ' (' + snes.nucleo + ')' : ['LoROM', 'HiROM', 'ExHiROM'][snes.cart.mapper] || '?', superfx: !!snes.cart.superfx } : null;
  const opcoes = `tema ${temaSalvo} · filtro ${filtro} · proporção ${proporcao} · moldura ${moldura} · rebobinar ${rebobLimite} s`;
  const erro = erroBug ? { mensagem: String(erroBug.message || erroBug), pilha: String(erroBug.stack || '').slice(0, 1500) } : null;
  let arquivo = '';
  if (comPacote) {
    const base = marcoBugAnt || marcoBug;
    const entradas = base ? (marcoBugAnt ? marcoBugAnt.entradas.concat(marcoBug ? marcoBug.entradas : []) : base.entradas) : [];
    const pacote = {
      formato: 'kofbug', versao: 1, nucleo: !snes || !snes.lr ? 'kof' : snes.s9x ? 's9x' : snes.nucleo, kofnes: VERSAO, quando: agora.toISOString(), descricao: desc, jogo, erro,
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
  L.push('### Ambiente', '', `- **KOFstation:** ${VERSAO}`, `- **Navegador:** ${navigator.userAgent}`, `- **Opções:** ${opcoes}`, '');
  if (erro) L.push('### Erro do emulador', '', '```', erro.mensagem, erro.pilha.slice(0, 1200), '```', '');
  if (arquivo) L.push('### Pacote pra reproduzir', '', `📎 **${CELULAR ? 'Anexe' : 'Arraste aqui'} o arquivo \`${arquivo}\`**, que o KOFstation acabou de baixar (pasta Downloads).`, 'Ele tem o savestate de alguns segundos antes e os botões apertados, pra reproduzir o bug quadro a quadro. A ROM **não** vai junto.', '');
  L.push('---', '_Reportado pelo modo caçador de bugs do KOFstation_');
  const titulo = `[bug] ${jogo ? jogo.nome + ': ' : ''}${desc.split('\n')[0].slice(0, 70)}`;
  const url = `https://github.com/${REPO}/issues/new?labels=bug&title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(L.join('\n')).slice(0, 7000)}`;
  if (aba) aba.location.href = url; else window.open(url, '_blank');
  fecharBug();
  avisar(arquivo ? (CELULAR ? '🐞 issue aberta no GitHub: anexe o pacote baixado' : '🐞 issue aberta no GitHub: arraste o pacote baixado pra dentro dela') : '🐞 issue aberta no GitHub', 6000);
}
function assinatura() { let t = 0; const f = snes.ppu.frame; for (let p = 0; p < f.length; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + snes.cpu.pc; }
// erro na interface (fora do núcleo): oferece reportar, no máximo uma vez por minuto
let ultimoErroUi = 0;
addEventListener('error', (e) => {
  if (!cacador || Date.now() - ultimoErroUi < 60000 || !e.error) return;
  ultimoErroUi = Date.now(); abrirBug(e.error);
});

// ---------------- atualizações ----------------
// O KOFnes.exe se atualiza sozinho ao abrir (baixa publicado/KOFnes.html do
// GitHub). Aqui só avisa: "atualizou" depois que trocou, e "tem versão nova"
// se o GitHub já tem uma maior que esta (aí é fechar e abrir de novo).
const BUILD = parseInt(VERSAO, 10) || 0;
const URL_VERSAO = `https://raw.githubusercontent.com/${REPO}/main/publicado/versao.txt`;
async function procurarAtualizacao(manual) {
  try {
    const t = await (await fetch(URL_VERSAO + '?t=' + Date.now(), { cache: 'no-store' })).text();
    const nova = +((t.match(/versao=(\d+)/) || [])[1] || 0);
    if (nova > BUILD) avisar('🆕 tem versão nova do KOFstation no GitHub: feche e abra o KOFstation pra atualizar', 8000);
    else if (manual) avisar(`✔ você está na versão mais nova (${VERSAO})`, 4000);
  } catch (e) { if (manual) avisar('não consegui falar com o GitHub agora', 4000); }
}
function avisarSeAtualizou() {
  const vista = +(ler('versaoVista') || 0);
  if (BUILD && vista && vista < BUILD) setTimeout(() => avisar(`✨ KOFstation atualizado! versão ${VERSAO}`, 5000), 1200);
  if (BUILD) guardar('versaoVista', BUILD);
  setTimeout(() => procurarAtualizacao(false), 10000);
}

// ---------------- rebobinar ----------------
// Estilo Príncipe da Pérsia: segure Backspace (ou Select+Y) e o jogo volta no tempo, em preto e
// branco, até 5 s. Soltou, ou acabou o tempo: a ampulheta zera e leva 6× isso de jogo pra encher
// de novo. É o "deu ruim", não uma fita (pra guardar um momento existem os savestates).
// Sem opção no menu; a chave "rebobLimite" do localStorage só existe pros testes.
const RECARGA_X = 6;                        // jogar 6× o limite recarrega
const rebobLimite = [3, 5, 10, 15].includes(+ler('rebobLimite')) ? +ler('rebobLimite') : 5;   // segundos
let rebob = null, rebobLigado = true, desdeFoto = 0, voltandoTecla = false, rebobinou = 0, rebobRecarga = 0, rebobTotal = 1, ampTexto = '';
const voltando = () => voltandoTecla || (estado() & 0x6000) === 0x6000;
const rebobPronto = () => !!rebob && rebobRecarga <= 0 && rebob.fotos > 0;
function novoRebob() {
  rebob = rebobLigado && snes ? KofEstado.Rebobinador(snes, 48 << 20, rebobLimite * 30) : null;   // ~30 fotos por segundo
  desdeFoto = 0; rebobRecarga = 0; marcarAmpulheta(); novoMarco(true);
}
function marcarAmpulheta() {
  let txt = '', frac = 0;
  if (rebobinou && rebob) { txt = '⏪ ' + (rebob.fotos / 30).toFixed(1).replace('.', ',') + ' s'; frac = rebob.fotos / (rebobLimite * 30); }
  else if (rebobRecarga > 0) { txt = '⏳ ' + Math.ceil(rebobRecarga / 60) + ' s'; frac = 1 - rebobRecarga / rebobTotal; }
  if (txt === ampTexto) return;
  ampTexto = txt; const el = $('#ampulheta'); el.hidden = !txt;
  if (txt) { el.firstElementChild.textContent = txt; el.style.setProperty('--enche', Math.round(frac * 100) + '%'); }
}
function rebobinarPasso() {
  if (!rebob.voltar()) { terminarRebobinar(); return; }   // acabou o tempo
  rebobinou++; document.body.classList.add('rebobinando');
  snes.pad[0] = 0; snes.runFrame(); snes.apu.dsp.outCount = 0;    // um quadro pra ter a imagem daquele momento
  desenhar(); marcarAmpulheta();
}
function terminarRebobinar() {
  document.body.classList.remove('rebobinando');
  if (rebobinou && rebob) { rebob.limpar(); rebobTotal = rebobRecarga = rebobLimite * RECARGA_X * 60; }   // usou: zera e recarrega
  rebobinou = 0; ini = fim = 0; sobra = 0; desdeFoto = 0; novoMarco(true); marcarAmpulheta();
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
    if (!EXT_ROM.test(nome)) continue;
    const dados = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
    const bruto = u8.subarray(dados, dados + tam);
    if (metodo === 0) return { nome, bytes: bruto };
    if (metodo !== 8) throw new Error('zip com compressão não suportada');
    const s = new Blob([bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { nome, bytes: new Uint8Array(await new Response(s).arrayBuffer()) };
  }
  throw new Error('o zip não tem nenhuma ROM dentro');
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
    const r = indexedDB.open('kofnes', 6);
    r.onupgradeneeded = (ev) => {
      const b = r.result;
      if (!b.objectStoreNames.contains('c')) b.createObjectStore('c');
      if (!b.objectStoreNames.contains('jogos')) b.createObjectStore('jogos', { keyPath: 'id' });
      if (!b.objectStoreNames.contains('estados')) b.createObjectStore('estados', { keyPath: 'n', autoIncrement: true }).createIndex('jogo', 'jogo');
      if (!b.objectStoreNames.contains('capas')) b.createObjectStore('capas');   // nome do jogo -> capa (Blob) ou {falhou}
      if (!b.objectStoreNames.contains('stats')) b.createObjectStore('stats', { keyPath: 'id' });   // tempo jogado, sessões, por dia
      if (!b.objectStoreNames.contains('roms')) b.createObjectStore('roms');
      if (!b.objectStoreNames.contains('autos')) b.createObjectStore('autos');
      if (!b.objectStoreNames.contains('musicas')) b.createObjectStore('musicas', { keyPath: 'n', autoIncrement: true });   // jukebox
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
  const cru = document.createElement('canvas'); cru.width = telaL; cru.height = telaA;
  cru.getContext('2d').putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = largura; c.height = Math.round(largura * telaA / telaL);
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
// no celular os núcleos são libretro em WebAssembly (nucleo.js); no PC, SNES é o núcleo Kof e os outros sistemas, libretro
async function novoNucleo(bytes, sis) {
  if (sis === 'snes' && !CELULAR && typeof KofNucleo !== 'undefined') return new KofNucleo.Snes(Int32Array.from(bytes));
  return KofLibretro.criar(bytes, sis);
}
async function abrirBytes(nome, bytes, guardarNaBiblioteca) {
  // sistema pela extensão; jogo antigo da biblioteca guardado sem extensão é de SNES
  const sis = !/\.[a-z0-9]{2,4}$/i.test(nome) ? 'snes' : sistemaDoNome(nome);
  if (!sis) throw new Error('não conheço esse tipo de arquivo (' + SIS_ATIVOS.map((k) => SIS[k].ext.map((e) => '.' + e).join(' ')).join(' ') + ')');
  if (bytes.length < SIS[sis].minimo) throw new Error('isso não parece uma ROM de ' + SIS[sis].nome);
  registrarTempo(); salvarSram(); await salvarAuto();
  const s = await novoNucleo(bytes, sis);
  romNome = nome.replace(/\.[^.]+$/, '');
  capaSis.set(romNome, sis === 'gb' && /\.gbc$/i.test(nome) ? 'gbc' : sis);
  jogoId = s.cart.title.trim() + '|' + bytes.length;
  chaveSram = 'sram.' + s.cart.title.trim() + '.' + bytes.length;
  const salvo = ler(chaveSram);
  if (salvo && s.cart.hasSram()) {
    const b = atob(salvo);
    for (let i = 0; i < b.length && i < s.cart.sram.length; i++) s.cart.sram[i] = b.charCodeAt(i);
  }
  s.reset();
  tamanhoTela(s.largura || 256, s.altura || 224); px.fill(0xFF000000);
  document.body.dataset.sis = sis;   // o controle virtual e a interface mudam com o sistema (Game Boy e NES: só A, B, Start e Select)
  document.body.classList.toggle('so-ab', !!(SIS[sis] && SIS[sis].botoes && !SIS[sis].botoes.includes('X')));
  QUADRO_MS = 1000 / (s.fps || 60.0988);
  snes = s; romAtual = bytes; sramAntes = textoSram(); pausado = false; sobra = 0; novoRebob(); avisarMudo(2200);
  document.body.classList.remove('vazio');
  fecharJanelas();
  $('#st-jogo').textContent = romNome + ' · ' + (s.cart.title.trim() || '?');
  marcarLateral();
  document.title = 'KOFstation — ' + romNome;
  ajustarEscala();
  // a ROM vai pra biblioteca: da próxima vez abre sem diálogo nenhum
  try {
    const novo = { id: jogoId, nome: romNome, arquivo: nome, sistema: sis, titulo: s.cart.title.trim(), tamanho: bytes.length, ultimo: Date.now() };
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
  const fs = [...e.dataTransfer.files];
  if (fs.length && fs.every((f) => /\.spc$/i.test(f.name))) { importarSpcs(fs); return; }
  if (fs[0]) abrirArquivo(fs[0]);
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
  if (l.length) carregarEstado(l[0]); else avisar((CELULAR ? 'nenhum estado salvo deste jogo (☰ → Salvar estado)' : 'nenhum estado salvo deste jogo (F5 salva)'));
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
// A pasta de ROMs pode ter milhares de arquivos: é lida UMA vez por sessão, em
// segundo plano (a biblioteca abre na hora com o que já tem e completa depois).
// "Reler pasta" ou escolher outra pasta lê de novo.
const normal = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// GoodTools: [h] hack, [b] ruim, [o] overdump, [t] trainer, [p] pirata, [f] corrigido, [a] alternativo
// ([T+Por] é tradução: maiúsculo, fica)
const VARIANTE = /\[(?:b|o|h|t|p|f|a)\d*[^\]]*\]/;
let pastaCache = null, lendoPasta = null, jogosItens = [], soPrincipais = ler('soPrincipais') !== '0';
async function varrer(dir, prof, saida) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory' && prof < 2) await varrer(h, prof + 1, saida);
    else if (h.kind === 'file' && (EXT_ROM.test(nome) || /\.zip$/i.test(nome))) {
      saida.push({ nome, h });
      if (saida.length % 250 === 0) estadoBib(`📁 lendo a pasta de ROMs… ${saida.length.toLocaleString('pt-BR')} arquivos`);
    }
  }
}
function lerPasta(pedir, forcar) {
  if (!temPasta) return Promise.resolve([]);
  if (pastaCache && !forcar) return Promise.resolve(pastaCache);
  if (lendoPasta) return lendoPasta;
  lendoPasta = (async () => {
    try {
      if (!pasta) pasta = await bdPegar('c', 'pasta');
      if (!pasta) return [];
      let p = await pasta.queryPermission({ mode: 'read' });
      if (p !== 'granted' && pedir) p = await pasta.requestPermission({ mode: 'read' });
      if (p !== 'granted') return [];
      estadoBib('📁 lendo a pasta de ROMs…');
      const l = []; await varrer(pasta, 0, l);
      l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      pastaCache = l.map((r) => {
        const nome = r.nome.replace(/\.[^.]+$/, '');
        return { nome, arquivo: r.nome, h: r.h, ext: r.nome.split('.').pop().toUpperCase(), chave: normal(nome), variante: VARIANTE.test(nome) };
      });
      return pastaCache;
    } catch (e) { return pastaCache || []; } finally { lendoPasta = null; }
  })();
  return lendoPasta;
}
async function montarItens() {
  let jogos = [];
  await carregarEstat();
  try { jogos = await bdTodos('jogos'); contagem = {}; (await bdTodos('estados')).forEach((e) => { contagem[e.jogo] = (contagem[e.jogo] || 0) + 1; }); } catch (e) { /* sem banco */ }
  jogosItens = jogos.sort((a, b) => b.ultimo - a.ultimo).map((j) => ({ nome: j.nome, jogo: j, chave: normal(j.nome || '') }));
  juntarItens();
}
function juntarItens() {
  const ja = new Set(jogosItens.map((r) => (r.jogo.arquivo || '').toLowerCase()));
  itens = jogosItens.concat((pastaCache || []).filter((r) => !ja.has(r.arquivo.toLowerCase())));
}
function marcarPrincipais() { const b = $('[data-acao="so-principais"]'); b.textContent = '🧹 Só os principais: ' + (soPrincipais ? 'ligado' : 'desligado'); b.title = 'esconde hacks [h], cópias ruins [b] [o], trainers [t]… (traduções [T+Por] ficam)'; }
function estadoBib(t) { const e = $('#bib-estado'); e.textContent = t || ''; e.hidden = !t; }
// ---------------- capas oficiais ----------------
// acervo aberto libretro-thumbnails (o mesmo do RetroArch), pelo nome No-Intro
// da ROM. Baixa uma vez e guarda no banco: depois funciona sem internet.
// um acervo por sistema; o app anota o sistema de cada nome de jogo que mostra (capaSis) pra buscar no acervo certo
const ACERVO = { snes: 'Nintendo_-_Super_Nintendo_Entertainment_System', nes: 'Nintendo_-_Nintendo_Entertainment_System', gb: 'Nintendo_-_Game_Boy', gbc: 'Nintendo_-_Game_Boy_Color' };
const capaSis = new Map();
const urlAcervo = (nome) => `https://raw.githubusercontent.com/libretro-thumbnails/${ACERVO[capaSis.get(nome)] || ACERVO.snes}/master/Named_Boxarts/`;
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
  const CAPAS = urlAcervo(nome);
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
// Game Boy Color tem acervo próprio (.gbc)
function anotarSisCapa(r) {
  let sis = sistemaDoItem(r);
  if (sis === 'gb' && /\.gbc$/i.test((r.jogo && r.jogo.arquivo) || r.nome)) sis = 'gbc';
  capaSis.set(r.nome, sis);
}
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
  capaJukeChegou();
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
function capaJukeChegou() { if (!$('#jukebox').hidden) montarJuke(); if (!$('#home').hidden) { clearTimeout(capaJukeChegou.t); capaJukeChegou.t = setTimeout(montarHome, 300); } }
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
  const r = visiveis[+e.target.dataset.i]; if (r) { anotarSisCapa(r); capaPorNome(r.nome).catch(() => {}); }
}), { root: $('#roms'), rootMargin: '200px' }) : null;
// a lista vai pra tela em lotes (150 de cada vez): com milhares de jogos, montar
// tudo de uma vez travava a janela; rolar ou andar com as setas carrega mais
const LOTE = 150;
let escondidas = 0;
function montarLista() {
  const ul = $('#roms'), palavras = normal($('#filtro').value).split(' ').filter(Boolean);
  escondidas = 0;
  visiveis = itens.filter((r) => {
    if (!palavras.every((w) => (r.chave || '').includes(w))) return false;
    if (soPrincipais && r.variante) { escondidas++; return false; }
    return true;
  });
  selecionada = Math.max(0, Math.min(selecionada, visiveis.length - 1));
  if (olhoCapas) olhoCapas.disconnect();
  ul.innerHTML = ''; lis = [];
  adicionarLis(Math.max(LOTE, selecionada + 30));
  $('#lista-vazia').hidden = itens.length > 0;
  $('#lista-vazia').innerHTML = temPasta
    ? 'Nenhum jogo ainda. Escolha a <b>pasta de ROMs</b> (só uma vez) ou arraste uma ROM pra cá.'
    : (CELULAR ? 'Nenhum jogo ainda. Volte ao <b>Início</b> e toque em <b>Abrir uma ROM</b>.' : 'Nenhum jogo ainda. Arraste uma ROM pra cá ou use <b>Adicionar arquivo</b>.');
  marcarSel(selecionada);
}
function contarBib() {
  if (lendoPasta) return;
  const n = visiveis.length, t = itens.length;
  let s = palavras().length ? `${n.toLocaleString('pt-BR')} ${n === 1 ? 'jogo achado' : 'jogos achados'}` : `${t.toLocaleString('pt-BR')} jogos`;
  if (escondidas) s += ` · ${escondidas.toLocaleString('pt-BR')} hacks/cópias ruins escondidos`;
  if (lis.length < n) s += ` · mostrando ${lis.length.toLocaleString('pt-BR')}, role pra ver mais`;
  estadoBib(t > 30 || escondidas ? s : '');
}
const palavras = () => normal($('#filtro').value).split(' ').filter(Boolean);
function adicionarLis(ate) {
  const ul = $('#roms'), frag = document.createDocumentFragment();
  for (let i = lis.length; i < Math.min(ate, visiveis.length); i++) {
    const r = visiveis[i];
    const li = document.createElement('li'); li.dataset.i = i;
    if (sofa) {
      const src = srcCapa(r), fig = document.createElement('div'); fig.className = 'mini';
      anotarSisCapa(r);
      if (olhoCapas) olhoCapas.observe(li); else capaPorNome(r.nome).catch(() => {});
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; im.loading = 'lazy'; fig.appendChild(im); } else fig.textContent = '☕';
      li.appendChild(fig);
    }
    const nm = document.createElement('span'); nm.textContent = r.nome; li.appendChild(nm);
    const sis = SIS_ATIVOS.length > 1 && sistemaDoItem(r);
    if (sis && sis !== 'snes') { const tag = document.createElement('small'); tag.className = 'sis-tag'; tag.textContent = SIS[sis].curto; li.appendChild(tag); }
    const sm = document.createElement('small');
    sm.textContent = r.jogo ? (contagem[r.jogo.id] ? '💾 ' + contagem[r.jogo.id] : '★') : r.ext;
    li.appendChild(sm);
    li.onclick = () => { if (selecionada === i) jogar(); else marcarSel(i); };
    lis.push(li); frag.appendChild(li);
  }
  ul.appendChild(frag);
  contarBib();
}
$('#roms').addEventListener('scroll', (e) => {
  const u = e.target;
  if (lis.length < visiveis.length && u.scrollTop + u.clientHeight > u.scrollHeight - 400) adicionarLis(lis.length + LOTE);
});
function marcarSel(i) {
  if (lis[selecionada]) lis[selecionada].classList.remove('sel');
  selecionada = Math.max(0, Math.min(i, visiveis.length - 1));
  if (selecionada >= lis.length - 5 && lis.length < visiveis.length) adicionarLis(selecionada + LOTE);
  const li = lis[selecionada];
  if (li) { li.classList.add('sel'); li.scrollIntoView({ block: 'nearest' }); }
  mostrarInfo();
}
function mostrarInfo() {
  const r = visiveis[selecionada], img = $('#capa-img');
  if (!r) { $('#info-nome').textContent = 'KOFstation'; $('#info-det').textContent = 'Super Nintendo e Game Boy, feito em Kof'; img.hidden = true; $('#capa-vazia').hidden = false; return; }
  $('#info-nome').textContent = r.nome;
  if (r.jogo) {
    const n = contagem[r.jogo.id] || 0;
    const e = estat[r.jogo.id], tempo = e && e.tempo ? ` · ${duracao(e.tempo)} no total em ${e.sessoes} ${e.sessoes === 1 ? 'sessão' : 'sessões'}` : '';
    $('#info-det').textContent = (SIS_ATIVOS.length > 1 ? SIS[sistemaDoItem(r)].nome + ' · ' : '') + `jogado ${quando(r.jogo.ultimo)}${tempo} · ${n} ${n === 1 ? 'estado salvo' : 'estados salvos'} · ${(r.jogo.tamanho / 1048576).toFixed(1)} MB`;
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
  anotarSisCapa(r); capaPorNome(r.nome).catch(() => {});
}
async function jogar(doZero) { await abrirJogo(visiveis[selecionada], doZero); }
async function abrirJogo(r, doZero) {
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
  if (e.code === 'Escape') { sairDaTela(); return true; }
  const passo = { ArrowDown: colunas(), ArrowUp: -colunas(), ArrowRight: sofa ? 1 : 0, ArrowLeft: sofa ? -1 : 0 }[e.code];
  if (passo) {
    e.preventDefault(); marcarSel(selecionada + passo); return true;
  }
  if (e.code === 'Enter') { e.preventDefault(); jogar(!!e.shiftKey); return true; }
  if (e.code === 'F6' || (e.code === 'KeyE' && e.target !== $('#filtro'))) { e.preventDefault(); acao('estados-do-sel'); return true; }
  if (e.target !== $('#filtro') && e.key.length === 1 && !e.ctrlKey) $('#filtro').focus();   // digitar já procura
  return true;
}
let filtroT = 0;
$('#filtro').addEventListener('input', () => { clearTimeout(filtroT); filtroT = setTimeout(() => { selecionada = 0; montarLista(); }, 140); });
async function mostrarBiblioteca(pedir, relerPasta) {
  fecharJanelas(); $('#biblioteca').hidden = false;
  await montarItens();
  $('#filtro').value = '';
  const k = itens.findIndex((r) => r.jogo && r.jogo.id === jogoId);   // o jogo atual vem selecionado
  selecionada = k >= 0 ? k : 0;
  montarLista();
  if (!pastaCache || relerPasta) {
    await lerPasta(pedir, relerPasta);
    const antes = visiveis[selecionada];
    juntarItens(); montarLista();
    if (antes) { const j = visiveis.indexOf(antes); if (j >= 0) marcarSel(j); }
  }
}
function fecharJanelas() { fecharTemas(false); for (const id of ['home', 'biblioteca', 'estados', 'guia', 'teclas', 'estatisticas', 'jukebox']) $('#' + id).hidden = true; capturando = null; if (rapidoAberto) fecharRapido(); }
// controle também navega na biblioteca
let padAntes = 0;
setInterval(() => {
  if (!$('#home').hidden) {               // no início: A/Start = ação principal, X = biblioteca
    const b = estado(), novo = b & ~padAntes; padAntes = b;
    if (novo & (0x0080 | 0x1000)) { const pr = $('#hm-destaque .grande'); if (pr) pr.click(); }
    if (novo & 0x0040) acao('biblioteca');
    return;
  }
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
  { t: '🎵 Guardar esta música', f: () => { fecharRapido(); guardarMusica(); } },
  { t: '🐞 Reportar bug', f: () => { fecharRapido(); abrirBug(); } },
  { t: '🗂 Estados salvos', f: () => { fecharRapido(); acao('estados'); } },
  { t: '☕ Biblioteca', f: () => { fecharRapido(); acao('biblioteca'); } },
  { t: '🎨 Tema', v: () => TODOS_TEMAS.find(([k]) => k === temaSalvo)[1], aj: (d) => tema(ciclar(TODOS_TEMAS, temaSalvo, d)), f: () => { fecharRapido(); acao('temas'); } },
  { t: 'Filtro', v: () => FILTROS.find(([k]) => k === filtro)[1], aj: (d) => aplicarFiltro(ciclar(FILTROS, filtro, d)) },
  { t: 'Cores do Game Boy', so: () => !!(snes && snes.sistema === 'gb'), v: () => PALETAS_GB.find(([k]) => k === paletaGb)[1], aj: (d) => mudarPaletaGb(ciclar(PALETAS_GB, paletaGb, d)) },
  { t: 'Cores do NES', so: () => !!(snes && snes.sistema === 'nes'), v: () => PALETAS_NES.find(([k]) => k === paletaNes)[1], aj: (d) => mudarPaletaNes(ciclar(PALETAS_NES, paletaNes, d)) },
  { t: 'Proporção', v: () => nomeProporcao(proporcao), aj: (d) => mudarProporcao(ciclar(PROPORCOES, proporcao, d)) },
  { t: 'Moldura', v: () => MOLDURAS.find(([k]) => k === moldura)[1], aj: (d) => mudarMoldura(ciclar(MOLDURAS, moldura, d)) },
  { t: 'Volume', v: () => (mudo ? 'mudo' : volume + '%'), aj: (d) => mudarVolume(d * 10) },
  { t: '⛶ Tela cheia', f: () => acao('cheia') },
  { t: '↺ Reiniciar', f: () => { fecharRapido(); acao('reiniciar'); } },
];
function montarRapido() {
  const ul = $('#rapido-lista'); ul.innerHTML = '';
  ITENS_RAPIDO.forEach((it, i) => {
    const li = document.createElement('li'); if (i === selR) li.className = 'sel';
    if (it.so && !it.so()) li.hidden = true;
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
  if (!snes || rapidoAberto || !$('#bug').hidden || telaAtual() !== 'jogo') return;
  fecharMenus(); fecharJanelas();
  rapidoAberto = true; pausadoAntesRapido = pausado; pausado = true; teclado = 0;
  selR = 0; montarRapido(); $('#rapido').hidden = false;
}
function fecharRapido() {
  if (!rapidoAberto) return;
  rapidoAberto = false; $('#rapido').hidden = true; pausado = pausadoAntesRapido; sobra = 0;
}
// botão direito do mouse: no jogo abre/fecha o menu rápido, nas telas faz Voltar (o menu do navegador quebra a
// imersão); nas caixas de texto o menu do navegador continua, pra colar
addEventListener('contextmenu', (e) => {
  if (e.target.closest('input, textarea')) return;
  e.preventDefault();
  // celular: o toque longo vira "botão direito"; só vale em cima da imagem do jogo (segurar um botão do controle, ou numa tela, não faz nada)
  if (CELULAR && !e.target.closest('#tela, #moldura')) return;
  if (rapidoAberto) fecharRapido();
  else if (!$('#temas').hidden || !$('#bug').hidden) return;
  else if (telaAtual() !== 'jogo') voltar();
  else if (snes) abrirRapido();
});
// clique fora do menu rápido fecha ele
addEventListener('mousedown', (e) => { if (rapidoAberto && e.button === 0 && !e.target.closest('#rapido')) fecharRapido(); });
function rapidoTecla(e) {
  const it = ITENS_RAPIDO[selR];
  if (e.repeat && e.code === 'Enter') { e.preventDefault(); return; }   // Enter ainda segurado do Select+Start
  if (['Escape', 'Backspace', 'F2'].includes(e.code)) { e.preventDefault(); fecharRapido(); return; }
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    const d = e.code === 'ArrowDown' ? 1 : -1, N = ITENS_RAPIDO.length;
    do selR = (selR + d + N) % N; while (ITENS_RAPIDO[selR].so && !ITENS_RAPIDO[selR].so());   // pula o que não vale pra esse sistema
    montarRapido(); return;
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
// (não pode chamar "voltar": esse nome é o do histórico de telas, e ele ganhava deste — por isso
// tirar print ou trocar de janela jogava a pessoa pro jogo)
function retomarAoVoltar() { if (pausadoPorSair) { pausadoPorSair = false; if (!rapidoAberto) { pausado = false; sobra = 0; } } }
addEventListener('blur', sair);
addEventListener('focus', retomarAoVoltar);
document.addEventListener('visibilitychange', () => { if (document.hidden) sair(); else retomarAoVoltar(); });

// ---------------- início (home) ----------------
// A primeira tela: o que você jogou por último (com o print de onde parou), os
// recentes, atalhos e uma dica. Muda com o tema, até a frase de boas-vindas.
const FRASES = {
  cafe: 'Um cafezinho e um clássico?', escuro: 'A noite é uma criança. E o jogo também.', claro: 'Dia bonito pra zerar um jogo.',
  zsnes: 'PRESS START', super16: 'Assopra o cartucho e bora.', portatil: 'Pilhas novas, jogo novo.',
  atomico: 'Transparente por fora, clássico por dentro.', blast16: 'Processamento a jato. Em Kof.', cinza32: '△ ○ ✕ □ … mas hoje é dia de 16 bits.',
  branco: 'Clique, relaxe, jogue.', laminas: 'Conquista desbloqueada: abriu o KOFstation.', neon: 'INSERT COIN',
  classico98: 'Bem-vindo ao KOFstation 98. Clique em Iniciar… digo, em Jogar.', luna: 'Seu emulador está pronto. Sem clipe de papel.',
  mensageiro: '🟢 KOFstation ficou online.', rosa2004: 'Você tem 1 recado novo: "bora jogar?"', terminal: '> kofnes --jogar_',
  vapor: 'ｋｏｆｎｅｓ　ａｅｓｔｈｅｔｉｃ', web1: '🚧 Bem-vindo à minha homepage!!! Você é o visitante nº 000427 🚧',
  esferas: "Seu poder de jogo passa de 9 mil!", unidade01: 'Entre no robô… digo, no jogo.', lua: 'Em nome da lua, vamos jogar!',
  dourado: "Queime o seu cosmo!", pokebola: 'Um jogo selvagem apareceu!', floresta: 'Um bom lugar pra se perder num jogo.',
  espresso: 'Curto, forte e sem açúcar.', cappuccino: 'Com espuma e tudo.', latte: 'Leve, cremoso e sem pressa.', mocha: 'Café com chocolate: fase boa.',
  caramelo: 'Doce o bastante pra mais uma fase.', coldbrew: 'Devagar, gelado e no ponto.', canela: 'Um cheirinho de canela e bora.',
  sessao: "Hoje tem filme e pipoca.",
  globinho: "Já acabou o desenho?!",
  lanhouse: "Mais 5 minutos, tio!",
  orkutmsn: "Fulano está online.",
  dvdcamelo: "Menu principal · Cenas · Extras",
  locadora: "Lembre-se: rebobine antes de devolver.",
  caderno: "Anote tudo, menos a cola.",
  recreio: "Tocou o sinal!",
  boteco: "Uma geladinha e mais uma fase.",
  chuva: "Barulho de chuva no telhado.",
  almoco: "Já pode sentar, tá na mesa.",
  feira: "Olha a banana, madame!",
  brasil98: "Tempo de CD-ROM e enciclopédia.",
  hexa2002: "É penta! (e já já é hexa)",
  ferias: "Foto da praia, câmera digital e areia no pé.",
  juninaescola: "Olha a cobra! É mentira!",
  casavo: "Come mais um pouquinho.",
  mp3: "Faixa 01 · Repetir tudo",
  gibi: "Edição especial · 52 páginas",
  interior: "Praça vazia, poste aceso.",
  clube: "Travessia: pé na estrada e o jogo na mão.",
  detetive: "Não vim parar no outro mundo por querer… foi o jogo.",
  folhas: "Esse é o meu jeito ninja!",
  mar: "Eu vou ser o Rei dos Piratas… do ranking!",
  alquimia: "Troca equivalente: um save por uma fase.",
  cadernomorte: "Este mundo está podre… e cabe a nós curá-lo. Agora, vai jogar!",
  lamina: "Bankai! Hora de jogar a sério.",
  digital: "Digievolua! Hora do jogo.",
  cartas: "Chave mágica, mostre o seu poder!",
  cacadores: "Eu vou ser um Hunter… dos jogos!",
  respiracao: "Respiração da Chama: aperte Start!",
  maldicao: "Em todo o céu e terra, só eu sou o melhor jogador.",
  motosserra: "Puxa a cordinha.",
  alem: "Já vivi mil anos. Dá tempo de zerar esse jogo.",
  familia: "Waku waku! Noite de jogos em família.",
  caos: "Alienígena ou fantasma? Os dois.",
  trem: "Não esqueça o seu nome. E salve o jogo.",
  mononoke: "Vivam! E não esqueçam de salvar.",
  tropicalia: "É proibido proibir… de jogar.",
  bossa: "Calma, o jogo espera.",
  samba: "Roda formada, bora jogar.",
  choro: "Cavaquinho, violão e um bom jogo.",
  frevo: "Sombrinha na mão e joystick na outra.",
  maracatu: "O cortejo chegou.",
  cordel: "Pega o jogo que a história é boa.",
  azulejo: "Cada tela, um ladrilho.",
  modernismo: "Arte, geometria e jogo.",
  brasilia: "Linhas curvas, céu aberto.",
  mataatlantica: "Névoa, musgo e chuva fina.",
  amazonica: "Luz dourada entre as copas.",
  sertao: "Sol a pino, céu azul de verdade.",
  pantanal: "Água, capim e céu largo.",
  cerrado: "Capim dourado e fim de tarde.",
  litoral: "Maré boa e céu limpo.",
  ouropreto: "Ladeira, pedra e sino.",
  baiana: "Axé, fita e tabuleiro.",
  junina: "Olha a fogueira!",
  carnaval: "Bloco na rua, jogo na mão.",
  smw: "It’s-a me! Vamos jogar?",
  alttp: "É perigoso ir sozinho! Leve este jogo.",
  metroid: "O planeta está em silêncio.",
  dkc: "Ele é o rei da selva, e agora o jogo é seu.",
  mmx: "Maverick Hunter na área. Hora de jogar.",
  chrono: "O tempo está ao seu favor.",
  ff6: "A ópera começa em instantes.",
  earthbound: "Ok! O Ness pegou o controle.",
  kirby: "Poyo!",
  fzero: "Show me your moves!",
  starfox: "Faça uma rolagem! (Do a barrel roll!)",
  cv4: "A noite pertence a eles.",
  contra: "↑↑↓↓←→←→ B A: 30 vidas!",
  sf2: "Hadouken! Round 1: lutar!",
  mk: "Termine-o! Fatality!",
  mana: "Uma árvore, uma espada, uma aventura.",
  mariokart: "Cuidado com a casca de banana!",
  yoshi: "Tudo desenhado a lápis de cor.",
  ghouls: "Cavaleiro de cueca, de novo.",
  terranigma: "A Terra recomeça com você.",
  desenho: 'Tá na hora do desenho… digo, do jogo!', camelo: '9999 JOGOS EM 1 (e esse funciona)', brasil: 'Bora jogar, Brasil!',
  encanador: "Pula, pula, pula!",
  heroi: "É perigoso ir sozinho. Leve um jogo.",
  cacadora: "Missão: zerar o jogo. Sem baixas.",
  corredor: "Mais rápido que o som. Menos que o 60 fps.",
  blocos: "Linha completa!",
  arena: "FIGHT! Round 1.",
  onca: "Silêncio na mata… e Start na mão.",
  arara: "Voando alto, jogando bonito.",
  capivara: "Calma. O jogo espera.",
  gato: "Sete vidas. Um save.",
  raposa: "Esperta, rápida e sem pausa.",
  panda: "Bambu, calma e um joguinho.",
  flamingo: "Numa perna só e jogando.",
};
const LOGOS = { clube: '🎶', smw: '🍄', alttp: '🗡️', metroid: '🛸', dkc: '🍌', mmx: '🤖', chrono: '⏳', ff6: '⚙️', earthbound: '🎈', kirby: '⭐', fzero: '🏎️', starfox: '🦊', cv4: '🦇', contra: '💥', sf2: '👊', mk: '🐉', mana: '🌱', mariokart: '🏁', yoshi: '🥚', ghouls: '🪦', terranigma: '🌍', tropicalia: '🌺', bossa: '🎸', samba: '🪘', choro: '🪕', frevo: '☂️', maracatu: '👑', cordel: '📜', azulejo: '🔷', modernismo: '🟨', brasilia: '🏛️', mataatlantica: '🌿', amazonica: '🌴', sertao: '🌵', pantanal: '🐊', cerrado: '🌾', litoral: '🌊', ouropreto: '⛪', baiana: '🥥', junina: '🔥', carnaval: '🎊', detetive: '👁️', folhas: '🍥', mar: '🏴‍☠️', alquimia: '⚗️', cadernomorte: '🍎', lamina: '⚔️', digital: '🧬', cartas: '🌸', cacadores: '🎣', respiracao: '🔥', maldicao: '🌀', motosserra: '🪚', alem: '✨', familia: '🥂', caos: '👽', trem: '🚂', mononoke: '🌲', sessao: '📺', globinho: '🖍️', lanhouse: '🎯', orkutmsn: '🦋', dvdcamelo: '📀', locadora: '📼', caderno: '📓', recreio: '🍬', boteco: '🍺', chuva: '🌧️', almoco: '🍲', feira: '🍅', brasil98: '🛰️', hexa2002: '⚽', ferias: '🏖️', juninaescola: '🎏', casavo: '🧶', mp3: '🎧', gibi: '🦸', interior: '🏘️', encanador: '🍄', heroi: '🗡️', cacadora: '🚀', corredor: '💨', blocos: '🧱', arena: '🥊', onca: '🐆', arara: '🦜', capivara: '🦫', gato: '🐈‍⬛', raposa: '🦊', panda: '🐼', flamingo: '🦩', cafe: '☕', espresso: '🖤', cappuccino: '🤎', latte: '🥛', mocha: '🍫', caramelo: '🍯', coldbrew: '🧊', canela: '🍂', escuro: '🌙', claro: '☀️', zsnes: '🕹️', super16: '🎮', portatil: '🔋', atomico: '💜', blast16: '⚡', cinza32: '💿',
  branco: '🤍', laminas: '🟢', neon: '🕹️', classico98: '🪟', luna: '🌄', mensageiro: '💬', rosa2004: '💌', terminal: '⌨️', vapor: '🌴',
  web1: '🚧', esferas: '⭐', unidade01: '🤖', lua: '🌙', dourado: '✨', pokebola: '🔴', floresta: '🌿', desenho: '📺', camelo: '🎁', brasil: '🇧🇷' };
const DICAS_PC = [
  'Deu ruim? Segure <b>Backspace</b> (ou Select+Y): o jogo volta até 5 segundos, em preto e branco. Depois a ampulheta ⏳ recarrega enquanto você joga.',
  'O <b>botão direito</b> do mouse abre o menu rápido no meio do jogo.',
  'Tocou aquela música que você ama? <b>F7</b> guarda ela na Jukebox.',
  'Achou um bug? <b>F9</b> abre a issue no GitHub com tudo pra reproduzir.',
  'No controle, <b>Select+Start</b> abre o menu rápido; <b>Select+L</b> salva e <b>Select+R</b> carrega.',
  'Arraste uma ROM pra janela pra jogar na hora.',
  '<b>Duplo clique</b> no jogo: tela cheia de verdade.',
  'Em <b>Imagem → Moldura</b> tem uma TV de madeira dos anos 80 esperando.',
  'O filtro <b>TV de tubo (CRT)</b> com proporção <b>4:3</b> é o mais perto da sua TV de antigamente.',
  'Na Jukebox, clique numa das 8 vozes pra silenciar e ouvir só o baixo ou a percussão.',
  'Na biblioteca, "mario super" acha "Super Mario World": a busca aceita as palavras em qualquer ordem.',
  'O <b>🛋 modo sofá</b> transforma a biblioteca numa grade de capas pra jogar de longe, com o controle.',
  '<b>Alt+←</b> (ou o ← do menu da esquerda) volta pra tela anterior.',
];
const DICAS_CEL = [
  'Toque em <b>☰</b> no meio do jogo pra salvar, carregar e mudar tema, filtro e volume.',
  'Segure <b>⏪</b>: o jogo volta até 5 segundos, em preto e branco. Depois a ampulheta ⏳ recarrega enquanto você joga.',
  'Em <b>Controles</b> você troca o modelo do controle, o tamanho, a transparência e liga o modo canhoto.',
  'Gire o celular: na horizontal os botões ficam nos cantos e o jogo ganha a tela.',
  'Toque em <b>Abrir uma ROM</b> pra escolher um jogo do seu celular (.sfc, .smc, .gb, .gbc, .nes ou .zip).',
  'Na Biblioteca, toque num jogo pra abrir; <b>Continuar</b> volta de onde você parou.',
  'Tocou aquela música que você ama? <b>☰ → Guardar esta música</b>: ela vai pra Jukebox e toca sem o jogo.',
  'Achou um bug? <b>☰ → Reportar bug</b> abre o GitHub com tudo pra reproduzir.',
  'O modelo de controle <b>Segue o tema</b> usa as cores do tema que você escolheu.',
  'Dá pra apertar vários botões ao mesmo tempo, e deslizar o dedo entre A, B, X e Y.',
];
const DICAS = CELULAR ? DICAS_CEL : DICAS_PC;
let homeJogos = [], dicaAtual = -1;
function fraseHome(id) {
  if ($('#home').hidden) return;
  const h = new Date().getHours(), ola = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  $('#hm-logo').textContent = LOGOS[id] || '🎮';
  $('#hm-saudacao').innerHTML = '';
  const b = document.createElement('b'); b.textContent = ola + '! ';
  $('#hm-saudacao').append(b, document.createTextNode(FRASES[id] || 'Bora jogar?'));
}
function novaDica() {
  let i; do { i = Math.floor(Math.random() * DICAS.length); } while (i === dicaAtual && DICAS.length > 1);
  dicaAtual = i; $('#hm-dica').innerHTML = DICAS[i];
}
function abrirHome() { fecharJanelas(); fecharMenus(); $('#home').hidden = false; montarHome(); }
const elem = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
function botao(txt, acaoNome, cls) { const b = elem('button', cls || 'grande', txt); b.dataset.acao = acaoNome; return b; }
async function montarHome() {
  fraseHome(document.documentElement.dataset.tema);
  if (dicaAtual < 0) novaDica();
  $('#hm-versao').textContent = 'versão ' + VERSAO;
  try { homeJogos = (await bdTodos('jogos')).sort((a, b) => b.ultimo - a.ultimo); } catch (e) { homeJogos = []; }
  await carregarEstat();
  const d = $('#hm-destaque'); d.innerHTML = '';
  const fig = elem('div', 'hm-print'), info = elem('div', 'hm-info');
  if (snes) {                                   // jogando agora: volta pro jogo
    const im = elem('img'); im.src = foto(320); im.alt = ''; fig.appendChild(im);
    info.append(elem('small', 'hm-rotulo', '🎮 Jogando agora'), elem('h2', '', romNome),
      elem('p', 'dica', 'O jogo está pausado esperando você.'), botao('▶ Voltar ao jogo', 'voltar-jogo'), botao('💾 Salvar estado', 'salvar-estado', 'grande sec'));
  } else if (homeJogos.length) {                // continuar de onde parou
    const j = homeJogos[0], e = estat[j.id], src = j.autoCapa || j.capa || srcCapa({ nome: j.nome, jogo: j });
    if (src) { const im = elem('img'); im.src = src; im.alt = ''; fig.appendChild(im); } else fig.textContent = LOGOS[temaSalvo] || '🎮';
    const det = [j.temAuto && autoSalvar ? 'parou em ' + quando(j.autoQuando) : 'jogado ' + quando(j.ultimo)];
    if (e && e.tempo) det.push(duracao(e.tempo) + ' jogados');
    info.append(elem('small', 'hm-rotulo', autoSalvar && j.temAuto ? '⟳ Continuar de onde parou' : '🕹 Jogado por último'), elem('h2', '', j.nome), elem('p', 'dica', det.join(' · ')),
      botao(autoSalvar && j.temAuto ? '▶ Continuar' : '▶ Jogar', 'hm-continuar'));
    if (autoSalvar && j.temAuto) info.appendChild(botao('↺ Começar do zero', 'hm-zero', 'grande sec'));
  } else {                                      // primeira vez
    fig.textContent = LOGOS[temaSalvo] || '🎮';
    info.append(elem('small', 'hm-rotulo', '👋 Primeira vez por aqui?'), elem('h2', '', 'Vamos começar'),
      elem('p', 'dica', CELULAR ? 'Toque em Abrir uma ROM e escolha o arquivo do jogo.' : 'Escolha a pasta onde ficam suas ROMs (uma vez só) ou arraste uma ROM pra esta janela.'));
    if (temPasta) info.appendChild(botao('📁 Escolher pasta de ROMs', 'pasta'));
    info.append(botao('＋ Abrir uma ROM', 'abrir', temPasta ? 'grande sec' : 'grande'), botao('📖 Ver o guia', 'guia', 'grande sec'));
  }
  d.append(fig, info);
  // recentes (sem repetir o do destaque)
  const rec = $('#hm-recentes'); rec.innerHTML = '';
  const lista = homeJogos.filter((j) => !(snes ? j.id === jogoId : j === homeJogos[0])).slice(0, 6);
  $('#hm-bloco-recentes').hidden = !lista.length;
  for (const j of lista) {
    const c = elem('button', 'hm-cartao'), src = srcCapa({ nome: j.nome, jogo: j });
    const capa = elem('div', 'hm-capa');
    if (src) { const im = elem('img'); im.src = src; im.alt = ''; im.loading = 'lazy'; capa.appendChild(im); } else capa.textContent = '🎮';
    c.append(capa, elem('span', '', j.nome));
    c.title = 'jogado ' + quando(j.ultimo);
    c.onclick = () => abrirJogo({ nome: j.nome, jogo: j }, false);
    rec.appendChild(c);
    anotarSisCapa({ nome: j.nome, jogo: j }); capaPorNome(j.nome).catch(() => {});
  }
}
// no início: Enter/A = ação principal; setas andam pelos botões
function homeTecla(e) {
  if (e.target.closest('input, textarea')) return false;
  if (e.code === 'Escape') { if (snes) fecharJanelas(); return true; }
  const bts = [...$('#home').querySelectorAll('button:not([hidden])')].filter((b) => b.offsetParent);
  const i = bts.indexOf(document.activeElement);
  if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
    e.preventDefault();
    const d = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1;
    (bts[i < 0 ? 0 : (i + d + bts.length) % bts.length] || {}).focus?.();
    return true;
  }
  if (e.code === 'Enter' && i < 0) { e.preventDefault(); const p = $('#hm-destaque .grande'); if (p) p.click(); return true; }
  return false;
}

// ---------------- voltar (histórico de telas) ----------------
// Cada tela que aparece guarda a anterior; Voltar (← do menu lateral, Alt+←,
// Esc numa janela, o botão "voltar" do mouse) leva de volta pra ela.
const TELAS = ['home', 'biblioteca', 'estados', 'jukebox', 'estatisticas', 'guia', 'teclas'];
const telaAtual = () => TELAS.find((id) => !$('#' + id).hidden) || 'jogo';
let historico = [], telaConhecida = 'jogo', voltandoHist = false, telaT = 0;
new MutationObserver(() => {
  clearTimeout(telaT);
  telaT = setTimeout(() => {     // espera a troca assentar (uma janela fecha e a outra abre)
    const t = telaAtual();
    if (t === telaConhecida) return;
    if (!voltandoHist && !(telaConhecida === 'jogo' && !snes)) { historico.push(telaConhecida); if (historico.length > 30) historico.shift(); }
    telaConhecida = t; if (t === 'jogo') historico = []; marcarLateral();
  }, 120);
}).observe($('#palco'), { attributes: true, attributeFilter: ['hidden'], subtree: true });
// Esc: fecha a tela e volta ao jogo (sem jogo, vai pro Início); já o Voltar anda pelo histórico de telas
function sairDaTela() { if (snes) fecharJanelas(); else if (telaAtual() !== 'home') abrirHome(); }
async function voltar() {
  let alvo;
  if (telaAtual() === 'jogo') alvo = 'home';
  else {   // o jogo só entra quando não sobra tela anterior (senão o Voltar ficava indo e vindo do jogo)
    const i = historico.findLastIndex((t) => t !== 'jogo' && t !== telaAtual());
    if (i >= 0) { alvo = historico[i]; historico.length = i; } else { historico = []; alvo = snes ? 'jogo' : 'home'; }
  }
  if (alvo === telaAtual()) return;
  voltandoHist = true;
  try { await abrirTela(alvo); } finally { setTimeout(() => { voltandoHist = false; }, 250); }
}
async function abrirTela(t) {
  switch (t) {
    case 'jogo': fecharJanelas(); break;
    case 'home': abrirHome(); break;
    case 'biblioteca': await mostrarBiblioteca(false); break;
    case 'jukebox': await abrirJuke(); break;
    case 'estatisticas': await mostrarEstat(); break;
    case 'estados': await mostrarEstados(jogoId); break;
    case 'guia': abrirGuia(); break;
    case 'teclas': fecharJanelas(); montarGrade(); $('#teclas').hidden = false; break;
  }
}
addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); voltar(); } });
function marcarLateral() {
  const t = telaAtual();
  $('#lat-jogo').hidden = !snes;
  document.querySelectorAll('#lateral [data-tela]').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === t));
}

// ---------------- guia ----------------
function abrirGuia(pagina) {
  fecharJanelas(); fecharMenus(); montarAjuda(); $('#guia').hidden = false;
  mostrarPaginaGuia(pagina || mostrarPaginaGuia.ultima || 'comecar');
}
function mostrarPaginaGuia(p) {
  mostrarPaginaGuia.ultima = p;
  document.querySelectorAll('#guia [data-pagina]').forEach((d) => { d.hidden = d.dataset.pagina !== p; });
  document.querySelectorAll('#guia [data-guia]').forEach((b) => b.classList.toggle('ativo', b.dataset.guia === p));
  $('#guia .gu-texto').scrollTop = 0;
}
$('#guia .gu-menu').addEventListener('click', (e) => { const b = e.target.closest('[data-guia]'); if (b) mostrarPaginaGuia(b.dataset.guia); });

// ---------------- menu, temas e ações ----------------
function avisar(t, ms) {
  const a = $('#aviso'); a.textContent = t; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => { a.hidden = true; }, ms || 1800);
}
const TEMAS = [
  ['Clássicos do KOFstation', [['escuro', '🌙 Escuro'], ['claro', '☀️ Claro'], ['zsnes', '🕹️ ZSNES']]],
  ['Café', [['cafe', '☕ Café queimado'], ['espresso', 'Espresso'], ['cappuccino', 'Cappuccino'], ['latte', 'Latte'], ['mocha', 'Mocha'],
    ['caramelo', 'Caramelo'], ['coldbrew', 'Cold Brew'], ['canela', 'Café com canela']]],
  ['Consoles', [['super16', 'Super 16-bit'], ['portatil', 'Portátil verde'], ['atomico', 'Roxo atômico'], ['blast16', 'Blast 16'],
    ['cinza32', 'Cinza 32-bit'], ['branco', 'Branco console'], ['laminas', 'Verde lâminas'], ['neon', 'Fliperama neon']]],
  ['Computador e internet antiga', [['classico98', 'Clássico 98'], ['luna', 'Azul Luna'], ['mensageiro', 'Mensageiro'], ['rosa2004', 'Rede social 2004'],
    ['terminal', 'Terminal'], ['vapor', 'Vaporwave'], ['web1', 'Web 1.0']]],
  ['Animes', [
    ['esferas', 'Esferas do Dragão', 'Laranja, azul e dourado de aventura e artes marciais.'],
    ['detetive', 'Detetive Espiritual', 'Verde profundo, azul elétrico e roxo do outro mundo.'],
    ['dourado', 'Cosmos Dourado', 'Azul cósmico, dourado e constelações discretas.'],
    ['folhas', 'Folhas da Vila', 'Laranja de macacão, azul de bandana e preto de ninja.'],
    ['mar', 'Mar de Aventuras', 'Azul oceânico, vermelho de bandana e ouro de tesouro.'],
    ['pokebola', 'Mundo Pokémon', 'Amarelo, vermelho e azul, alegre e cheio de energia.'],
    ['alquimia', 'Círculo da Alquimia', 'Vinho, aço e vermelho de círculo de transmutação.'],
    ['cadernomorte', 'Caderno da Morte', 'Capa preta, etiqueta branca e a maçã vermelha.'],
    ['lamina', 'Lâmina Espiritual', 'Preto e branco de tinta, com laranja de lâmina.'],
    ['digital', 'Mundo Digital', 'Azul e verde digitais num painel claro de grade.'],
    ['cartas', 'Cartas Mágicas', 'Rosa, creme, lilás e um dourado delicado.'],
    ['cacadores', 'Caçadores de Aventuras', 'Verde de mapa antigo, azul e dourado de licença de caçador.'],
    ['respiracao', 'Respiração Solar', 'Preto, verde e vermelho de padrão xadrez.'],
    ['maldicao', 'Energia Amaldiçoada', 'Preto, roxo e azul de energia sobrenatural.'],
    ['motosserra', 'Motosserra Urbana', 'Laranja, preto e vermelho de oficina e concreto.'],
    ['alem', 'Além das Estrelas', 'Verde suave, azul acinzentado e dourado contemplativo.'],
    ['familia', 'Família em Segredo', 'Verde-oliva, rosa e creme com ar de espionagem retrô.'],
    ['caos', 'Caos Paranormal', 'Rosa neon e azul elétrico sobre roxo-escuro.'],
    ['trem', 'Trem dos Espíritos', 'Verde-água, vermelho de lanterna e ouro, sobre água calma.'],
    ['mononoke', 'Espíritos da Floresta', 'Verde-floresta, cinza de névoa, terra e vermelho de argila.'],
    ['unidade01', 'Unidade 01', 'Roxo e verde de robô gigante, com alerta laranja.'],
    ['lua', 'Guerreira da lua', 'Rosa, azul e dourado de uma noite de lua cheia.'],
    ['floresta', 'Floresta encantada', 'Verdes fundos e luz de vaga-lume.']]],
  ['Animais', [['onca', 'Onça-pintada'], ['arara', 'Arara-azul'], ['capivara', 'Capivara zen'], ['gato', 'Gato preto'], ['raposa', 'Raposa'], ['panda', 'Panda'], ['flamingo', 'Flamingo']]],
  ['Bem brasileiro', [['desenho', 'Manhã de desenho'], ['camelo', 'Console de camelô'], ['brasil', 'Brasil'],
    ['sessao', 'Sessão da Tarde', 'Azul de televisão, sol de tarde e laranja de VHS.'],
    ['globinho', 'TV Globinho', 'Azul elétrico, amarelo vibrante e vermelho de desenho animado.'],
    ['lanhouse', 'Lan House 2007', 'Âmbar sobre verde-oliva de menu de FPS clássico e linhas de monitor de tubo.'],
    ['orkutmsn', 'Orkut & MSN', 'Janela azul de mensageiro, rosa de rede social e bolinha verde: online.'],
    ['dvdcamelo', 'DVD de Camelô', 'Preto, prata e vermelho de capa de DVD e menu antigo.'],
    ['locadora', 'A Locadora', 'Azul-marinho, vinho e creme de capa de VHS.'],
    ['caderno', 'Caderno de Escola', 'Papel pautado, azul de caneta e margem vermelha.'],
    ['recreio', 'Recreio', 'Verde de quadra, amarelo de sol e doce de embalagem.'],
    ['boteco', 'Boteco do Bairro', 'Verde-garrafa, madeira escura e luz quente de fim de tarde.'],
    ['chuva', 'Chuva no Interior', 'Cinza azulado, verde apagado e uma luz amarela acolhedora.'],
    ['almoco', 'Almoço de Domingo', 'Creme, terracota e verde-oliva de mesa de família.'],
    ['feira', 'Feira de Domingo', 'Vermelho tomate, amarelo banana e verde folha de feira livre.'],
    ['brasil98', 'Brasil 1998', 'Verde escuro, amarelo envelhecido e azul de céu.'],
    ['hexa2002', 'Hexa 2002', 'Amarelo canário, verde bandeira e azul profundo de Copa.'],
    ['ferias', 'Férias de Verão', 'Turquesa, coral e sol, como álbum de férias.'],
    ['juninaescola', 'Festa Junina da Escola', 'Azul de noite, laranja de fogueira e bandeirinhas.'],
    ['casavo', 'Casa da Vó', 'Creme, madeira, verde antigo e a luz do abajur.'],
    ['mp3', 'MP3 & Fone de Ouvido', 'Prata metálico, preto e azul neon de tocador de MP3.'],
    ['gibi', 'Gibi da Banca', 'Vermelho, amarelo, azul e papel envelhecido de gibi.'],
    ['interior', 'Cidade do Interior', 'Azul de anoitecer, laranja de poste e concreto de rua tranquila.'],
    ['tropicalia', 'Tropicália', 'Verde, amarelo, rosa e cores psicodélicas de 1968.'],
    ['bossa', 'Bossa Nova', 'Creme, azul-petróleo e areia: minimalista e tranquilo.'],
    ['samba', 'Samba de Raiz', 'Vinho, dourado e madeira quente de roda de samba.'],
    ['choro', 'Choro Brasileiro', 'Madeira, verde-musgo e creme de instrumento acústico.'],
    ['frevo', 'Frevo', 'Vermelho, amarelo, azul e verde de sombrinha de frevo.'],
    ['maracatu', 'Maracatu', 'Preto, vermelho e dourado intensos de cortejo.'],
    ['cordel', 'Cordel', 'Papel envelhecido, tinta preta e terra, de xilogravura.'],
    ['azulejo', 'Azulejo Português', 'Azul-cobalto e branco de azulejo antigo.'],
    ['modernismo', 'Modernismo Brasileiro', 'Cores primárias e formas geométricas de composição modernista.'],
    ['brasilia', 'Concreto de Brasília', 'Branco, cinza e azul de arquitetura modernista.'],
    ['mataatlantica', 'Mata Atlântica', 'Verde profundo, musgo e a umidade da floresta.'],
    ['amazonica', 'Floresta Amazônica', 'Verde-jade e escuro, com luz dourada filtrada.'],
    ['sertao', 'Sertão', 'Ocre, terracota e areia sob um azul intenso.'],
    ['pantanal', 'Pantanal', 'Verde-oliva, azul de água e tons de terra.'],
    ['cerrado', 'Cerrado', 'Dourado, cobre e verde seco da vegetação nativa.'],
    ['litoral', 'Litoral Tropical', 'Turquesa, areia clara e coral, com sol e mar.'],
    ['ouropreto', 'Ouro Preto', 'Pedra, terracota, creme e dourado envelhecido.'],
    ['baiana', 'Baiana', 'Branco, azul, vermelho e dourado da cultura baiana.'],
    ['junina', 'Festa Junina', 'Azul noturno, vermelho, amarelo e laranja de fogueira.'],
    ['carnaval', 'Carnaval de Rua', 'Magenta, amarelo, verde e azul, vibrante e cheio de confete.'],
    ['clube', 'Clube da Esquina', 'MPB mineira: terra vermelha, sépia de foto antiga e a esquina de BH.']]],
  ['Clássicos do SNES', [
    ['smw', 'Super Mario World', 'Azul celeste, verde vivo e cores alegres de plataforma.'],
    ['alttp', 'The Legend of Zelda: A Link to the Past', 'Verde floresta, dourado e pergaminho de fantasia.'],
    ['metroid', 'Super Metroid', 'Preto, roxo profundo e verde alienígena de sci-fi.'],
    ['dkc', 'Donkey Kong Country', 'Verde tropical, marrom e tons de selva.'],
    ['mmx', 'Mega Man X', 'Azul metálico, ciano e cinza industrial.'],
    ['chrono', 'Chrono Trigger', 'Azul celeste, verde e dourado de aventura no tempo.'],
    ['ff6', 'Final Fantasy VI', 'Vinho, azul noturno e dourado de fantasia a vapor.'],
    ['earthbound', 'EarthBound', 'Rosa, azul pastel e cores excêntricas.'],
    ['kirby', 'Kirby Super Star', 'Rosa, azul claro e branco, alegre e suave.'],
    ['fzero', 'F-Zero', 'Preto, roxo e ciano neon de velocidade futurista.'],
    ['starfox', 'Star Fox', 'Azul espacial, verde e laranja de ficção científica.'],
    ['cv4', 'Super Castlevania IV', 'Preto, vinho, cinza e roxo gótico.'],
    ['contra', 'Contra III', 'Preto, vermelho e verde militar, industrial.'],
    ['sf2', 'Street Fighter II Turbo', 'Vermelho, azul e amarelo com energia de fliperama.'],
    ['mk', 'Mortal Kombat', 'Preto, vermelho escuro e dourado sombrios.'],
    ['mana', 'Secret of Mana', 'Verde mágico, azul e tons naturais.'],
    ['mariokart', 'Super Mario Kart', 'Vermelho, azul, amarelo e verde de pista e itens.'],
    ['yoshi', 'Yoshi\'s Island', 'Verde, rosa e amarelo de desenho feito à mão.'],
    ['ghouls', 'Super Ghouls \'n Ghosts', 'Roxo, cinza e azul noturno de fantasia sombria.'],
    ['terranigma', 'Terranigma', 'Azul profundo, verde e dourado, épico e contemplativo.'],
    ['encanador', 'Mundo dos encanadores', 'Céu azul, tijolo e cano de um mundo de plataforma.'], ['heroi', 'Herói de verde', 'Verde de floresta e dourado de relíquia, em clima de aventura.'], ['cacadora', 'Caçadora espacial', 'Escuro de nave com âmbar de visor de capacete.'], ['corredor', 'Corredor azul', 'Azul veloz e anéis dourados de um corredor sem freio.'], ['blocos', 'Blocos que caem', 'Cores primárias de peças que encaixam e descem.'], ['arena', 'Arena de luta', 'Preto, vermelho e dourado de arena de luta.']]],
];
const TODOS_TEMAS = TEMAS.flatMap(([, l]) => l);
document.querySelectorAll('.n-temas').forEach((e) => { e.textContent = TODOS_TEMAS.length; });
// galeria (pop-up): passar o mouse (ou o foco das setas) experimenta o tema na
// janela toda; clicar escolhe; sair da galeria sem escolher volta ao de antes
let temaSalvo = 'cafe';
function experimentar(id) {
  document.documentElement.dataset.tema = id;
  fraseHome(id);
  const t = TODOS_TEMAS.find(([k]) => k === id);
  $('#tema-nome').textContent = t ? '· ' + t[1] + (id === temaSalvo ? ' (em uso)' : '') : '';
}
// A galeria tem uma caixa de busca e uma fileira de categorias (os grupos de TEMAS, mais "Todos").
// Pra colocar tema novo: um bloco [data-tema="id"] no estilo.css + uma linha em TEMAS ([id, nome, descrição opcional]) (o grupo novo
// aparece sozinho como categoria). A busca acha por nome, categoria ou id, sem ligar pra acento.
let temasCat = 'todos', temasBusca = '';
const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function achaTema(grupo, id, nome, desc) {
  const palavras = semAcento(temasBusca).split(/\s+/).filter(Boolean), alvo = semAcento(`${nome} ${grupo} ${id} ${desc || ''}`);
  return palavras.every((p) => alvo.includes(p));
}
function temasFiltrados() {   // [[grupo, [[id, nome]...]]...] só com o que passa na categoria e na busca
  return TEMAS.map(([grupo, lista]) => [grupo, lista.filter(([id, nome, desc]) => (temasCat === 'todos' || temasCat === grupo) && achaTema(grupo, id, nome, desc))]).filter(([, l]) => l.length);
}
function montarCategorias() {
  const c = $('#temas-cats'); c.innerHTML = '';
  const cont = TEMAS.map(([grupo, lista]) => [grupo, lista.filter(([id, nome, desc]) => achaTema(grupo, id, nome, desc)).length]);
  const total = cont.reduce((t, [, n]) => t + n, 0);
  for (const [cat, rotulo, n] of [['todos', 'Todos', total], ...cont.map(([g, n]) => [g, g, n])]) {
    const b = document.createElement('button'); b.className = 'cat' + (cat === temasCat ? ' ativo' : ''); b.dataset.cat = cat;
    b.textContent = `${rotulo} · ${n}`; b.disabled = n === 0 && cat !== temasCat; c.appendChild(b);
  }
}
$('#temas-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { temasCat = b.dataset.cat; montarTemas(); } });
$('#temas-busca').addEventListener('input', (e) => { temasBusca = e.target.value.trim(); montarTemas(); });
function montarTemas() {
  const g = $('#grade-temas'); g.innerHTML = '';
  montarCategorias();
  const filtrados = temasFiltrados();
  if (!filtrados.length) { const p = document.createElement('p'); p.className = 'dica'; p.textContent = 'nenhum tema encontrado' + (temasBusca ? ` pra "${temasBusca}"` : ''); g.appendChild(p); }
  for (const [grupo, lista] of filtrados) {
    const h = document.createElement('h3'); h.textContent = grupo; g.appendChild(h);
    const d = document.createElement('div'); d.className = 'temas-grupo';
    for (const [id, nome, desc] of lista) {
      const b = document.createElement('button'); b.className = 'previa'; b.dataset.tema = id; b.title = desc ? `${nome}: ${desc}` : nome;
      b.innerHTML = '<span class="pv-barra"></span><span class="pv-corpo"><span class="pv-nome"></span><span class="pv-desc"></span><span class="pv-tela"></span><span class="pv-bot"></span></span>';
      b.querySelector('.pv-nome').textContent = nome;
      b.querySelector('.pv-desc').textContent = desc || '';
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
// ---------------- showcase dos temas ----------------
// Dois botões na galeria: lento (3,5 s por tema, pra olhar) e rápido (0,5 s por tema, pra apresentar o KOFstation pros outros).
// Esc ou "Parar" volta pro tema de antes; "Ficar com este" escolhe o que estiver na tela.
let showTimer = 0, showFim = 0, showI = 0, showLista = [];
function passarTema() {
  const [id, nome] = showLista[showI % showLista.length]; showI++;
  experimentar(id);
  $('#showcase-nome').textContent = nome; $('#showcase-n').textContent = ((showI - 1) % showLista.length + 1) + '/' + showLista.length;
}
function iniciarShowcase(ms = 3500) {
  if (showTimer) return;
  clearTimeout(showFim);   // um Parar recente ainda ia tirar a classe do showcase novo
  if (!snes && telaAtual() === 'jogo') abrirHome();
  showLista = temasFiltrados().flatMap(([, l]) => l); if (!showLista.length) showLista = TODOS_TEMAS;   // respeita a categoria e a busca da galeria
  showI = Math.max(0, showLista.findIndex(([k]) => k === temaSalvo));
  document.documentElement.classList.add('showcase'); document.documentElement.classList.toggle('showcase-rapido', ms < 1000); $('#showcase').hidden = false;
  passarTema(); showTimer = setInterval(passarTema, ms);
}
function pararShowcase(ficar) {
  if (!showTimer) return;
  clearInterval(showTimer); showTimer = 0; $('#showcase').hidden = true;
  const atual = document.documentElement.dataset.tema;
  if (ficar) { tema(atual); avisar('🎨 tema: ' + TODOS_TEMAS.find(([k]) => k === atual)[1]); } else experimentar(temaSalvo);
  showFim = setTimeout(() => document.documentElement.classList.remove('showcase', 'showcase-rapido'), 700);
}
let temasVoltar = null;   // a janela que estava aberta (biblioteca...) volta quando a galeria fecha
function abrirTemas() {
  temasVoltar = ['home', 'biblioteca', 'estatisticas', 'jukebox', 'estados', 'guia'].find((id) => !$('#' + id).hidden) || null;
  fecharMenus(); if (rapidoAberto) fecharRapido();   // a tela de trás fica (aparece sob o véu e muda ao vivo)
  temasCat = 'todos'; temasBusca = ''; $('#temas-busca').value = '';
  montarTemas(); $('#temas').hidden = false; $('#veu').hidden = false;
  const b = $(`.previa[data-tema="${temaSalvo}"]`); if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
}
function fecharTemas(voltar) {
  if ($('#temas').hidden) return;
  $('#temas').hidden = true; $('#veu').hidden = true; experimentar(temaSalvo);
  if (voltar !== false && temasVoltar) $('#' + temasVoltar).hidden = false;
  temasVoltar = null;
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
  coresOndas();   // o osciloscópio da jukebox segue o tema
}
async function acao(a) {
  fecharMenus();
  switch (a) {
    case 'abrir': $('#arquivo').click(); break;
    case 'pasta':
      if (!temPasta) { avisar('este navegador não deixa escolher pasta; use Adicionar arquivo', 4000); break; }
      try { pasta = await showDirectoryPicker({ id: 'kofnes-roms', mode: 'read' }); await bdPor('c', 'pasta', pasta); pastaCache = null; await mostrarBiblioteca(true, true); } catch (e) { /* cancelou */ }
      break;
    case 'biblioteca': await mostrarBiblioteca(true); break;
    case 'reler-pasta': await mostrarBiblioteca(true, true); break;
    case 'so-principais':
      soPrincipais = !soPrincipais; guardar('soPrincipais', soPrincipais ? '1' : '0'); marcarPrincipais(); montarLista(); break;
    case 'fechar-biblioteca': voltar(); break;
    case 'jogar': await jogar(false); break;
    case 'auto-toggle':
      autoSalvar = !autoSalvar; guardar('autoSalvar', autoSalvar ? '1' : '0'); marcarAuto();
      avisar(autoSalvar ? 'salvar automático ligado' : 'salvar automático desligado'); break;
    case 'sofa': modoSofa(!sofa); await mostrarBiblioteca(true); break;
    case 'capas': capasNet = !capasNet; guardar('capas', capasNet ? '1' : '0'); $('[data-acao="capas"]').textContent = capasNet ? '🖼 Capas oficiais: ligadas' : '🖼 Capas oficiais: desligadas'; montarLista(); break;
    case 'do-zero': await jogar(true); break;
    case 'estados-do-sel': { const r = visiveis[selecionada]; await mostrarEstados(r && r.jogo ? r.jogo.id : jogoId); break; }
    case 'estados': await mostrarEstados(jogoId); break;
    case 'fechar-estados': voltar(); break;
    case 'salvar-estado': await salvarEstado(); break;
    case 'carregar-ultimo': await carregarUltimo(); break;
    case 'reiniciar': if (snes) { snes.reset(); novoRebob(); avisar('reiniciado'); } break;
    case 'pausar': if (snes) { if (juke.tocando) jukePausar(); pausado = !pausado; avisar(pausado ? 'pausado' : 'continuando'); } break;
    case 'mudo': mudo = !mudo; guardar('mudo', mudo ? '1' : '0'); marcarSom(); avisar(mudo ? 'som desligado' : 'som ligado'); break;
    case 'bug': abrirBug(); break;
    case 'atualizacao': await procurarAtualizacao(true); break;
    case 'jukebox': await abrirJuke(); break;
    case 'fechar-jukebox': await voltar(); montarJuke(); break;
    case 'guardar-musica': await guardarMusica(); break;
    case 'abrir-spc': $('#arquivo-spc').click(); break;
    case 'jk-tocar': jukeAlternar(); break;
    case 'jk-vista-capa': mudarVistaJuke('capa'); break;
    case 'jk-vista-ondas': mudarVistaJuke('ondas'); break;
    case 'jk-prox': jukeProxima(1); break;
    case 'jk-ant': jukeProxima(-1); break;
    case 'jk-aleatorio': juke.aleatorio = !juke.aleatorio; montarJuke(); break;
    case 'jk-repetir': juke.repetir = !juke.repetir; montarJuke(); break;
    case 'jk-parar': jukeFechar(); break;
    case 'bug-enviar': await enviarBug(); break;
    case 'bug-fechar': fecharBug(); break;
    case 'cacador-toggle':
      cacador = !cacador; guardar('cacador', cacador ? '1' : '0'); novoMarco(true); marcarCacador();
      avisar(cacador ? '🐞 caçador de bugs ligado: se o emulador quebrar, ele oferece reportar' : 'caçador de bugs desligado'); break;
    case 'vol-menos': mudarVolume(-10); break;
    case 'vol-mais': mudarVolume(10); break;
    case 'rapido': if (rapidoAberto) fecharRapido(); else if (!snes) avisar('abra um jogo primeiro'); else if (telaAtual() !== 'jogo') avisar('o menu rápido é só durante o jogo'); else abrirRapido(); break;
    case 'pausa-auto':
      pausaAuto = !pausaAuto; guardar('pausaAuto', pausaAuto ? '1' : '0'); marcarSom();
      avisar(pausaAuto ? 'pausa ao sair da janela ligada' : 'pausa ao sair da janela desligada'); break;
    case 'cheia': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
    case 'temas': if ($('#temas').hidden) abrirTemas(); else fecharTemas(); break;
    case 'showcase': fecharTemas(); iniciarShowcase(3500); break;
    case 'showcase-rapido': fecharTemas(); iniciarShowcase(500); break;
    case 'showcase-parar': pararShowcase(false); break;
    case 'showcase-ficar': pararShowcase(true); break;
    case 'fechar-temas': fecharTemas(); if (!snes && telaAtual() === 'jogo') abrirHome(); break;
    case 'estatisticas': await mostrarEstat(); break;
    case 'fechar-estat': voltar(); break;
    case 'controles': abrirGuia('atalhos'); break;
    case 'guia': abrirGuia(); break;
    case 'fechar-guia': voltar(); break;
    case 'home': abrirHome(); break;
    case 'voltar': voltar(); break;
    case 'voltar-jogo': if (snes) fecharJanelas(); break;
    case 'hm-dica': novaDica(); break;
    case 'hm-continuar': { const j = homeJogos[0]; if (j) abrirJogo({ nome: j.nome, jogo: j }, false); break; }
    case 'hm-zero': { const j = homeJogos[0]; if (j) abrirJogo({ nome: j.nome, jogo: j }, true); break; }
    case 'teclas': fecharJanelas(); montarGrade(); $('#teclas').hidden = false; break;
    case 'fechar-teclas': capturando = null; voltar(); break;
    case 'teclas-padrao':
      mapa = {}; for (const [n, , padrao] of BOTOES_SNES) mapa[n] = padrao;
      guardar('teclas', JSON.stringify(mapa)); montarTeclas(); montarGrade(); montarAjuda(); avisar('teclas padrão restauradas');
      break;
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
  else if (b.dataset.tema && b.closest('#temas')) { tema(b.dataset.tema); fecharTemas(); avisar('🎨 tema: ' + TODOS_TEMAS.find(([k]) => k === temaSalvo)[1]); if (!snes && telaAtual() === 'jogo') abrirHome(); }
  else if (b.dataset.filtro) { aplicarFiltro(b.dataset.filtro); fecharMenus(); }
  else if (b.dataset.prop) { mudarProporcao(b.dataset.prop); fecharMenus(); }
  else if (b.dataset.moldura) { mudarMoldura(b.dataset.moldura); fecharMenus(); }
  else if (b.dataset.paletaGb) { mudarPaletaGb(b.dataset.paletaGb); fecharMenus(); }
  else if (b.dataset.paletaNes) { mudarPaletaNes(b.dataset.paletaNes); fecharMenus(); }
});

document.body.classList.add('vazio');
carregarMapa();
montarAjuda();
tema(ler('tema') || 'cafe');
aplicarFiltro(filtro);
marcarAuto();
marcarSom();
marcarCacador();
marcarPrincipais();
avisarSeAtualizou();
document.body.classList.toggle('sofa', sofa);
$('[data-acao="capas"]').textContent = capasNet ? '🖼 Capas oficiais: ligadas' : '🖼 Capas oficiais: desligadas';
ajustarEscala();
if (!temPasta) document.querySelectorAll('[data-acao="pasta"], [data-acao="reler-pasta"]').forEach((b) => { b.hidden = true; });
if (sofa) mostrarBiblioteca(false); else abrirHome();
window.KOFnes = { abrirArquivo, estado: () => ({ snes: !!snes, pausado, romNome, jogoId }), nucleo: () => snes, botoes: () => estado(), mapa: () => mapa, filtro: () => filtro, auto: () => autoSalvar, webgl: !!gl,
  // pros testes: lista falsa de n jogos (mede a biblioteca) e uma quebra de mentira no núcleo
  testeLista: (n, nomes) => { fecharJanelas(); itens = Array.from({ length: n }, (_, i) => { const nome = nomes ? nomes[i % nomes.length] + (i >= nomes.length ? ' #' + i : '') : 'Jogo de teste ' + i; return { nome, ext: 'SFC', chave: normal(nome), variante: VARIANTE.test(nome) }; }); $('#biblioteca').hidden = false; const t0 = performance.now(); montarLista(); const t1 = performance.now(); for (let k = 0; k < 30; k++) listaTecla({ code: 'ArrowDown', preventDefault() {}, target: null, key: '' }); return { montar: Math.round(t1 - t0), trintaSetas: Math.round(performance.now() - t1) }; },
  forcarErro: () => { const r = snes.runFrame; snes.runFrame = () => { snes.runFrame = r; throw new Error('quebra de teste'); }; },
  volume: () => volume, juke: () => ({ faixas: juke.lista.length, atual: juke.atual, tocando: juke.tocando, amostras: juke.amostras, mudas: juke.mudas, efetivas: mudasEfetivas(), solo: juke.solo, vista: jkVista, fila: (fim - ini) & (FILA - 1) }), marcos: () => [!!marcoBugAnt, marcoBug ? marcoBug.entradas.length : -1], versao: VERSAO, rebob: () => rebob && { fotos: rebob.fotos, bytes: rebob.bytes }, moldura: () => moldura, rebobEstado: () => ({ limite: rebobLimite, recarga: Math.round(rebobRecarga), fotos: rebob ? rebob.fotos : -1, ativo: !!rebobinou }), estat: () => estat, tema: () => document.documentElement.dataset.tema, mudarTema: (t) => tema(t), rapido: () => rapidoAberto, pausado: () => pausado, tamTela: () => [tela.clientWidth, tela.clientHeight],
  assinatura: () => { let t = 0; const f = snes.ppu.frame; for (let p = 0; p < f.length; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + snes.cpu.pc; } }; // pros testes
})();
