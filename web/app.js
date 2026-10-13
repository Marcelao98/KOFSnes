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
const tela = $('#tela'), ctx = tela.getContext('2d', { alpha: false });
const img = ctx.createImageData(256, 224), px = new Uint32Array(img.data.buffer);
function desenhar() {
  const f = snes.ppu.frame;
  // o núcleo entrega 0xAARRGGBB; o canvas (little-endian) quer 0xAABBGGRR
  for (let i = 0; i < 57344; i++) {
    const c = f[i];
    px[i] = 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
  }
  ctx.putImageData(img, 0, 0);
}
function ajustarEscala() {
  const p = $('#palco'), maxE = Math.max(1, Math.floor(Math.min((p.clientWidth - 16) / 256, (p.clientHeight - 16) / 224)));
  const e = escala ? Math.min(escala, maxE) : maxE;
  tela.style.width = 256 * e + 'px'; tela.style.height = 224 * e + 'px';
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
const TECLAS = {
  KeyZ: 0x8000, KeyA: 0x4000, ShiftLeft: 0x2000, ShiftRight: 0x2000, Enter: 0x1000,
  ArrowUp: 0x0800, ArrowDown: 0x0400, ArrowLeft: 0x0200, ArrowRight: 0x0100,
  KeyX: 0x0080, KeyS: 0x0040, KeyQ: 0x0020, KeyW: 0x0010,
};
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
  if ($('#lista').hidden === false && listaTecla(e)) return;
  if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); acao('abrir'); return; }
  if (e.ctrlKey && e.code === 'KeyL') { e.preventDefault(); acao('lista'); return; }
  if (e.code === 'F1') { e.preventDefault(); acao('reiniciar'); return; }
  if (e.code === 'F11') { e.preventDefault(); acao('cheia'); return; }
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
async function abrirArquivo(arq) {
  try {
    let nome = arq.name, bytes = new Uint8Array(await arq.arrayBuffer());
    if (/\.zip$/i.test(nome)) ({ nome, bytes } = await lerZip(bytes.buffer));
    if (bytes.length < 0x8000) throw new Error('isso não parece uma ROM de SNES');
    salvarSram();
    const s = new KofNucleo.Snes(Int32Array.from(bytes));
    romNome = nome.replace(/\.[^.]+$/, '');
    chaveSram = 'sram.' + s.cart.title.trim() + '.' + bytes.length;
    const salvo = ler(chaveSram);
    if (salvo && s.cart.hasSram()) {
      const b = atob(salvo);
      for (let i = 0; i < b.length && i < s.cart.sram.length; i++) s.cart.sram[i] = b.charCodeAt(i);
    }
    s.reset();
    snes = s; sramAntes = textoSram(); pausado = false; sobra = 0;
    document.body.classList.remove('vazio');
    $('#inicio').hidden = true; $('#lista').hidden = true;
    $('#st-jogo').textContent = romNome + ' · ' + (s.cart.title.trim() || '?');
    document.title = 'KOFnes — ' + romNome;
    guardar('ultima', nome);
    ajustarEscala();
  } catch (e) { avisar(e.message, 5000); }
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
addEventListener('pagehide', salvarSram);
document.addEventListener('visibilitychange', () => { if (document.hidden) salvarSram(); });

$('#arquivo').addEventListener('change', (e) => { if (e.target.files[0]) abrirArquivo(e.target.files[0]); e.target.value = ''; });
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('arrastando'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('arrastando'); });
addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('arrastando');
  if (e.dataTransfer.files[0]) abrirArquivo(e.dataTransfer.files[0]);
});

// ---------------- pasta de ROMs (lista estilo ZSNES) ----------------
// a pasta fica guardada (IndexedDB) e a lista se monta dentro da janela,
// sem o diálogo do Windows; precisa do Edge/Chrome (File System Access)
const temPasta = 'showDirectoryPicker' in window;
let pasta = null, roms = [], selecionada = 0;
function banco(modo, valor) {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open('kofnes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('c');
      r.onsuccess = () => {
        const t = r.result.transaction('c', modo ? 'readwrite' : 'readonly').objectStore('c');
        const q = modo ? t.put(valor, 'pasta') : t.get('pasta');
        q.onsuccess = () => ok(q.result); q.onerror = () => ok(null);
      };
      r.onerror = () => ok(null);
    } catch (e) { ok(null); }
  });
}
async function varrer(dir, pre, prof) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory' && prof < 2) await varrer(h, pre + nome + '/', prof + 1);
    else if (h.kind === 'file' && /\.(sfc|smc|zip|fig|swc)$/i.test(nome)) roms.push({ nome, caminho: pre + nome, h });
  }
}
async function carregarPasta(pedir) {
  if (!pasta) pasta = await banco(false);
  if (!pasta) return false;
  let p = await pasta.queryPermission({ mode: 'read' });
  if (p !== 'granted' && pedir) p = await pasta.requestPermission({ mode: 'read' });
  if (p !== 'granted') return false;
  roms = []; await varrer(pasta, '', 0);
  roms.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  return true;
}
function montarLista() {
  const f = $('#filtro').value.toLowerCase(), ul = $('#roms');
  const vis = roms.filter((r) => r.caminho.toLowerCase().includes(f));
  ul.innerHTML = '';
  selecionada = Math.min(selecionada, Math.max(0, vis.length - 1));
  vis.forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = r.nome.replace(/\.[^.]+$/, '');
    const s = document.createElement('small'); s.textContent = r.nome.split('.').pop().toUpperCase();
    li.appendChild(s);
    if (i === selecionada) li.className = 'sel';
    li.onclick = () => r.h.getFile().then(abrirArquivo);
    ul.appendChild(li);
  });
  $('#lista-vazia').hidden = roms.length > 0;
  $('#lista-vazia').innerHTML = !temPasta
    ? 'Este navegador não deixa ler pastas. Use <b>Arquivo → Abrir ROM</b> ou arraste a ROM.'
    : pasta ? 'Nenhuma ROM (.sfc, .smc, .zip) nessa pasta.' : 'Nenhuma pasta escolhida. Use <b>Arquivo → Escolher pasta de ROMs</b>.';
  const sel = ul.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
  return vis;
}
function listaTecla(e) {
  if (e.code === 'Escape') { $('#lista').hidden = true; return true; }
  const vis = montarLista.vis || [];
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault(); selecionada = Math.max(0, Math.min(vis.length - 1, selecionada + (e.code === 'ArrowDown' ? 1 : -1)));
    montarLista.vis = montarLista(); return true;
  }
  if (e.code === 'Enter') { e.preventDefault(); if (vis[selecionada]) vis[selecionada].h.getFile().then(abrirArquivo); return true; }
  return e.target === $('#filtro');
}
$('#filtro').addEventListener('input', () => { selecionada = 0; montarLista.vis = montarLista(); });
async function mostrarLista() {
  $('#ajuda').hidden = true; $('#lista').hidden = false;
  if (temPasta) { try { await carregarPasta(true); } catch (e) { /* permissão negada */ } }
  montarLista.vis = montarLista(); $('#filtro').focus();
}

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
      if (!temPasta) { avisar('este navegador não deixa escolher pasta; use Abrir ROM', 4000); break; }
      try { pasta = await showDirectoryPicker({ id: 'kofnes-roms', mode: 'read' }); await banco(true, pasta); await mostrarLista(); } catch (e) { /* cancelou */ }
      break;
    case 'lista': await mostrarLista(); break;
    case 'fechar-lista': $('#lista').hidden = true; break;
    case 'reiniciar': if (snes) { snes.reset(); avisar('reiniciado'); } break;
    case 'pausar': if (snes) { pausado = !pausado; avisar(pausado ? 'pausado' : 'continuando'); } break;
    case 'mudo': mudo = !mudo; guardar('mudo', mudo ? '1' : '0'); avisar(mudo ? 'som desligado' : 'som ligado'); break;
    case 'cheia': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); break;
    case 'controles': $('#lista').hidden = true; $('#ajuda').hidden = false; break;
    case 'fechar-ajuda': $('#ajuda').hidden = true; break;
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
});
addEventListener('fullscreenchange', ajustarEscala);

document.body.classList.add('vazio');
tema(ler('tema') || 'cafe');
ajustarEscala();
if (!temPasta) document.querySelectorAll('[data-acao="pasta"]').forEach((b) => { b.hidden = true; });
window.KOFnes = { abrirArquivo, estado: () => ({ snes: !!snes, pausado, romNome }) }; // pros testes
})();
