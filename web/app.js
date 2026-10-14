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
function ajustarEscala() {
  const p = $('#palco'), maxE = Math.max(1, Math.floor(Math.min((p.clientWidth - 16) / 256, (p.clientHeight - 16) / 224)));
  const e = escala ? Math.min(escala, maxE) : maxE;
  tela.style.width = 256 * e + 'px'; tela.style.height = 224 * e + 'px';
  if (gl) {   // o canvas WebGL desenha na resolução da tela, pros filtros terem detalhe
    const dpr = window.devicePixelRatio || 1;
    tela.width = Math.round(256 * e * dpr); tela.height = Math.round(224 * e * dpr);
    gl.viewport(0, 0, tela.width, tela.height); gl.uniform2f(glSaida, tela.width, tela.height); pintar();
  } else { tela.width = 256; tela.height = 224; }
  document.querySelectorAll('[data-escala]').forEach((b) => b.classList.toggle('ativo', +b.dataset.escala === escala));
}
addEventListener('resize', ajustarEscala);

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
    no.connect(audio.destination);
  } catch (e) { audio = null; }
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
const RESERVADAS = ['Escape', 'Tab', 'F1', 'F5', 'F6', 'F8', 'F11', 'KeyP', 'KeyM'];
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
    ['Controle USB/Xbox', 'também funciona', 'Tela cheia', 'F11'],
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
addEventListener('keydown', (e) => {
  ligarSom();
  if (capturando) { capturar(e); return; }
  if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); acao('abrir'); return; }
  if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); acao('biblioteca'); return; }
  if (e.code === 'F5') { e.preventDefault(); acao('salvar-estado'); return; }
  if (e.code === 'F6') { e.preventDefault(); acao('estados'); return; }
  if (e.code === 'F8') { e.preventDefault(); acao('carregar-ultimo'); return; }
  if (e.code === 'F11') { e.preventDefault(); acao('cheia'); return; }
  if (!$('#biblioteca').hidden) { listaTecla(e); return; }
  const aberta = ['estados', 'ajuda', 'teclas'].some((id) => !$('#' + id).hidden);
  if (e.code === 'Escape' && aberta) { fecharJanelas(); return; }
  if (e.code === 'F1') { e.preventDefault(); acao('reiniciar'); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { acao('pausar'); return; }
  if (e.code === 'KeyM') { acao('mudo'); return; }
  if (e.code === 'Tab') { e.preventDefault(); turbo = true; return; }
  if (TECLAS[e.code] && snes) { e.preventDefault(); teclado |= TECLAS[e.code]; }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') turbo = false;
  if (TECLAS[e.code]) teclado &= ~TECLAS[e.code];
});
addEventListener('blur', () => { teclado = 0; turbo = false; });

// ---------------- laço principal ----------------
let ultimo = 0, sobra = 0, contados = 0, marco = 0;
function laco(t) {
  requestAnimationFrame(laco);
  if (!snes || pausado) { ultimo = t; return; }
  sobra += Math.min(t - ultimo, 100); ultimo = t;
  let vezes = 0;
  try {
    if (turbo) {
      for (let k = 0; k < 4; k++) { snes.pad[0] = estado(); snes.runFrame(); snes.apu.dsp.outCount = 0; }
      vezes = 4; sobra = 0;
    } else {
      while (sobra >= QUADRO_MS && vezes < 4) {
        snes.pad[0] = estado(); snes.runFrame(); empurrarSom(); sobra -= QUADRO_MS; vezes++;
      }
    }
  } catch (e) {
    pausado = true; avisar('erro no emulador: ' + e.message, 6000); console.error(e); return;
  }
  if (vezes) desenhar();
  contados += vezes;
  if (t - marco >= 1000) {
    $('#st-fps').textContent = (pausado ? 'pausado · ' : '') + Math.round(contados * 1000 / (t - marco)) + ' fps';
    contados = 0; marco = t; salvarSram();
  }
}
requestAnimationFrame(laco);

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
// c: configurações (a pasta de ROMs) · jogos: ROM + print da última vez ·
// estados: savestates (comprimidos) com o print do momento
let bd = null;
function abrirBanco() {
  if (bd) return bd;
  bd = new Promise((ok, falha) => {
    const r = indexedDB.open('kofnes', 2);
    r.onupgradeneeded = () => {
      const b = r.result;
      if (!b.objectStoreNames.contains('c')) b.createObjectStore('c');
      if (!b.objectStoreNames.contains('jogos')) b.createObjectStore('jogos', { keyPath: 'id' });
      if (!b.objectStoreNames.contains('estados')) b.createObjectStore('estados', { keyPath: 'n', autoIncrement: true }).createIndex('jogo', 'jogo');
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
  salvarSram(); await salvarAuto();
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
  snes = s; sramAntes = textoSram(); pausado = false; sobra = 0;
  document.body.classList.remove('vazio');
  fecharJanelas();
  $('#st-jogo').textContent = romNome + ' · ' + (s.cart.title.trim() || '?');
  document.title = 'KOFnes — ' + romNome;
  ajustarEscala();
  // a ROM vai pra biblioteca: da próxima vez abre sem diálogo nenhum
  try {
    const antigo = await bdPegar('jogos', jogoId);
    // mantém tudo o que o registro já tinha (capa oficial, estado automático...)
    await bdGuardar('jogos', { ...(antigo || {}), id: jogoId, nome: romNome, arquivo: nome, titulo: s.cart.title.trim(),
      tamanho: bytes.length, rom: guardarNaBiblioteca || !antigo ? bytes : antigo.rom, ultimo: Date.now() });
    autoAntes = Date.now();
  } catch (e) { console.warn('biblioteca indisponível', e); }
}
async function atualizarCapa() {   // print do jogo atual vira a capa dele na biblioteca
  if (!snes || !jogoId) return;
  try {
    const j = await bdPegar('jogos', jogoId);
    if (j) { j.capa = foto(256); j.ultimo = Date.now(); await bdGuardar('jogos', j); }
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
addEventListener('pagehide', () => { salvarSram(); salvarAuto(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { salvarSram(); salvarAuto(); } });

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
    const j = await bdPegar('jogos', jogoId);
    if (!j) return;
    j.auto = texto; j.autoQuando = Date.now(); j.autoCapa = capa; j.capa = capa; j.ultimo = Date.now();
    await bdGuardar('jogos', j);
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
      const j = await bdPegar('jogos', est.jogo);
      if (!j || !j.rom) { avisar('a ROM desse jogo não está na biblioteca', 4000); return; }
      await abrirBytes(j.arquivo || j.nome, j.rom, false);
    }
    KofEstado.restaurar(snes, JSON.parse(await descomprimir(est.dados)));
    snes.apu.dsp.outCount = 0; ini = fim = 0; sobra = 0; pausado = false;
    fecharJanelas();
    snes.runFrame(); snes.apu.dsp.outCount = 0; desenhar();
    avisar('estado de ' + quando(est.quando) + ' carregado');
  } catch (e) { avisar('não consegui carregar: ' + e.message, 4000); }
}
async function continuar(j) {
  await abrirBytes(j.arquivo || j.nome, j.rom, false);
  if (!j.auto) return;
  KofEstado.restaurar(snes, JSON.parse(j.auto));
  snes.apu.dsp.outCount = 0; ini = fim = 0; sobra = 0;
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
  if (jAuto && jAuto.auto) {
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
  $('#estados-vazio').hidden = lista.length > 0 || !!(jAuto && jAuto.auto);
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
function nomesCapa(nome) {
  const limpo = nome.replace(/[&*/:`<>?\\|"]/g, '_').trim();
  const semRev = limpo.replace(/\s*\((Rev [^)]*|Beta[^)]*|Proto[^)]*|v\d[^)]*)\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim();
  const base = semRev.replace(/^(.*?\([^)]*\)).*$/, '$1');   // "Nome (Região)"
  return [...new Set([limpo, semRev, base])];
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
async function garantirCapa(j) {
  if (!capasNet || !j || j.boxart || (j.boxartFalhou && Date.now() - j.boxartFalhou < 7 * 864e5)) return;
  const blob = await baixarCapa(j.nome);
  const atual = await bdPegar('jogos', j.id);
  if (!atual) return;
  if (blob) { atual.boxart = blob; j.boxart = blob; } else atual.boxartFalhou = j.boxartFalhou = Date.now();
  await bdGuardar('jogos', atual);
  if (blob) montarLista();
}
function srcCapa(j) {   // capa oficial, senão o print de quando parou
  if (j && j.boxart && capasNet) {
    if (!urlsCapa.has(j.id)) urlsCapa.set(j.id, URL.createObjectURL(j.boxart));
    return urlsCapa.get(j.id);
  }
  return j ? (j.autoCapa || j.capa || '') : '';
}

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

function montarLista() {
  const f = $('#filtro').value.toLowerCase(), ul = $('#roms');
  visiveis = itens.filter((r) => r.nome.toLowerCase().includes(f));
  selecionada = Math.max(0, Math.min(selecionada, visiveis.length - 1));
  ul.innerHTML = '';
  visiveis.forEach((r, i) => {
    const li = document.createElement('li');
    if (sofa) {
      const src = srcCapa(r.jogo), fig = document.createElement('div'); fig.className = 'mini';
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; im.loading = 'lazy'; fig.appendChild(im); } else fig.textContent = '☕';
      li.appendChild(fig);
    }
    const nm = document.createElement('span'); nm.textContent = r.nome; li.appendChild(nm);
    const sm = document.createElement('small');
    sm.textContent = r.jogo ? (contagem[r.jogo.id] ? '💾 ' + contagem[r.jogo.id] : '★') : r.ext;
    li.appendChild(sm);
    if (i === selecionada) li.className = 'sel';
    li.onclick = () => { if (selecionada === i) jogar(); else { selecionada = i; montarLista(); } };
    ul.appendChild(li);
  });
  $('#lista-vazia').hidden = itens.length > 0;
  $('#lista-vazia').innerHTML = temPasta
    ? 'Nenhum jogo ainda. Escolha a <b>pasta de ROMs</b> (só uma vez) ou arraste uma ROM pra cá.'
    : 'Nenhum jogo ainda. Arraste uma ROM pra cá ou use <b>Adicionar arquivo</b>.';
  const sel = ul.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  mostrarInfo();
}
function mostrarInfo() {
  const r = visiveis[selecionada], img = $('#capa-img');
  if (!r) { $('#info-nome').textContent = 'KOFnes'; $('#info-det').textContent = 'Super Nintendo escrito em Kof'; img.hidden = true; $('#capa-vazia').hidden = false; return; }
  $('#info-nome').textContent = r.nome;
  if (r.jogo) {
    const n = contagem[r.jogo.id] || 0;
    $('#info-det').textContent = `jogado ${quando(r.jogo.ultimo)} · ${n} ${n === 1 ? 'estado salvo' : 'estados salvos'} · ${(r.jogo.tamanho / 1048576).toFixed(1)} MB`;
  } else $('#info-det').textContent = 'na pasta de ROMs · ainda não jogado';
  const auto = autoSalvar && !!(r.jogo && r.jogo.auto);
  $('[data-acao="jogar"]').textContent = auto ? '▶ Continuar' : '▶ Jogar';
  $('[data-acao="do-zero"]').hidden = !auto;
  if (auto) $('#info-det').textContent += ` · parou em ${quando(r.jogo.autoQuando)}`;
  const src = srcCapa(r.jogo);
  img.hidden = !src; $('#capa-vazia').hidden = !!src; if (src) img.src = src;
  img.classList.toggle('oficial', !!(r.jogo && r.jogo.boxart && capasNet));
  const parou = $('#parou-img'), mostrarParou = !!(r.jogo && r.jogo.boxart && capasNet && r.jogo.autoCapa);
  parou.hidden = !mostrarParou; if (mostrarParou) parou.src = r.jogo.autoCapa;
  if (r.jogo) garantirCapa(r.jogo).catch(() => {});
}
async function jogar(doZero) {
  const r = visiveis[selecionada];
  if (!r) return;
  try {
    if (autoSalvar && r.jogo && r.jogo.auto && !doZero) await continuar(r.jogo);
    else if (r.jogo) await abrirBytes(r.jogo.arquivo || r.nome, r.jogo.rom, false);
    else await abrirArquivo(await r.h.getFile());
  } catch (e) { avisar(e.message, 4000); }
}
function listaTecla(e) {
  if (e.code === 'Escape') { if (snes) fecharJanelas(); return true; }
  const passo = { ArrowDown: colunas(), ArrowUp: -colunas(), ArrowRight: sofa ? 1 : 0, ArrowLeft: sofa ? -1 : 0 }[e.code];
  if (passo) {
    e.preventDefault(); selecionada = Math.max(0, Math.min(visiveis.length - 1, selecionada + passo));
    montarLista(); return true;
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
function fecharJanelas() { for (const id of ['biblioteca', 'estados', 'ajuda', 'teclas']) $('#' + id).hidden = true; capturando = null; }
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

// ---------------- menu, temas e ações ----------------
function avisar(t, ms) {
  const a = $('#aviso'); a.textContent = t; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => { a.hidden = true; }, ms || 1800);
}
function tema(nome) {
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
    case 'reiniciar': if (snes) { snes.reset(); avisar('reiniciado'); } break;
    case 'pausar': if (snes) { pausado = !pausado; avisar(pausado ? 'pausado' : 'continuando'); } break;
    case 'mudo': mudo = !mudo; guardar('mudo', mudo ? '1' : '0'); avisar(mudo ? 'som desligado' : 'som ligado'); break;
    case 'cheia': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
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
  m.firstElementChild.addEventListener('click', (e) => { e.stopPropagation(); const ab = m.classList.contains('aberto'); fecharMenus(); if (!ab) m.classList.add('aberto'); });
  m.addEventListener('mouseenter', () => { if (document.querySelector('.m.aberto') && !m.classList.contains('aberto')) { fecharMenus(); m.classList.add('aberto'); } });
});
addEventListener('click', (e) => {
  ligarSom();
  const b = e.target.closest('button');
  if (!b) { if (!e.target.closest('.janela')) fecharMenus(); return; }
  if (b.dataset.acao) acao(b.dataset.acao);
  else if (b.dataset.escala) { escala = +b.dataset.escala; guardar('escala', escala); ajustarEscala(); fecharMenus(); }
  else if (b.dataset.tema && b.closest('.sub')) { tema(b.dataset.tema); fecharMenus(); }
  else if (b.dataset.filtro) { aplicarFiltro(b.dataset.filtro); fecharMenus(); }
});
addEventListener('fullscreenchange', ajustarEscala);

document.body.classList.add('vazio');
carregarMapa();
montarAjuda();
tema(ler('tema') || 'cafe');
aplicarFiltro(filtro);
marcarAuto();
document.body.classList.toggle('sofa', sofa);
$('[data-acao="capas"]').textContent = capasNet ? '🖼 Capas oficiais: ligadas' : '🖼 Capas oficiais: desligadas';
ajustarEscala();
if (!temPasta) document.querySelectorAll('[data-acao="pasta"]').forEach((b) => { b.hidden = true; });
mostrarBiblioteca(false);
window.KOFnes = { abrirArquivo, estado: () => ({ snes: !!snes, pausado, romNome, jogoId }), botoes: () => estado(), mapa: () => mapa, filtro: () => filtro, auto: () => autoSalvar, webgl: !!gl,
  assinatura: () => { let t = 0; const f = snes.ppu.frame; for (let p = 0; p < 57344; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + snes.cpu.pc; } }; // pros testes
})();
