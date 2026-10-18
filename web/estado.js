// Savestate do KOFnes: tira uma "foto" de TODO o estado do console (os
// objetos do núcleo Kof compilado: CPU, PPU, APU, DSP, SPC700, cartucho,
// Super FX...) e devolve depois. Sem DOM: o teste roda no Node.
//
// O grafo é percorrido uma vez por objeto (as referências de volta, tipo
// cpu.bus -> snes, viram {r: id}). Arrays tipados vão em base64; a ROM fica
// de fora (não muda, e a biblioteca já guarda). Restaurar escreve os valores
// de volta nos objetos que já existem, criados pela mesma ROM.
const KofEstado = (() => {
  'use strict';
  // rom: não muda; frame e outBuf: o próximo quadro refaz
  const PULAR = new Set(['rom', 'frame', 'outBuf']);
  const TIPOS = { Int32Array, Uint8Array, Int16Array, Uint16Array, Int8Array, Uint32Array, Float32Array, Float64Array };
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deB64(t) {
    const s = atob(t), u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  // Int32Array cujos valores cabem em 8 ou 16 bits (RAMs, VRAM) vão compactos
  function tipado(v) {
    // pelo nome do tipo, não por instanceof: o núcleo pode estar noutro contexto
    // JS (vm do Node, iframe) com o seu próprio Int32Array
    const i32 = v.constructor.name === 'Int32Array';
    let min = 0, max = 0;
    if (i32) for (let i = 0; i < v.length; i++) { const x = v[i]; if (x < min) min = x; if (x > max) max = x; }
    const k = (i32 && min >= 0) ? (max <= 0xFF ? 'u8' : max <= 0xFFFF ? 'u16' : '') : '';
    const c = k === 'u8' ? Uint8Array.from(v) : k === 'u16' ? Uint16Array.from(v) : v;
    return { a: v.constructor.name, k, d: b64(new Uint8Array(c.buffer, c.byteOffset, c.byteLength)) };
  }
  function desTipado(n) {           // nó guardado -> array tipado do tipo original
    const u8 = deB64(n.d);
    const bruto = n.k === 'u8' ? u8 : n.k === 'u16' ? new Uint16Array(u8.buffer) : null;
    if (bruto) return TIPOS[n.a].from(bruto);
    const T = TIPOS[n.a]; return new T(u8.buffer, 0, u8.byteLength / T.BYTES_PER_ELEMENT);
  }
  function capturar(raiz) {
    const vistos = new Map();
    const valor = (v) => {
      if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
      if (vistos.has(v)) return { r: vistos.get(v) };       // o mesmo array em dois lugares
      if (ArrayBuffer.isView(v)) { vistos.set(v, vistos.size); return tipado(v); }
      if (Array.isArray(v)) { vistos.set(v, vistos.size); return { l: v.map(valor) }; }
      return objeto(v);
    };
    const objeto = (o) => {
      if (vistos.has(o)) return { r: vistos.get(o) };
      const id = vistos.size; vistos.set(o, id);
      const f = {};
      for (const k of Object.keys(o)) {
        if (PULAR.has(k)) continue;
        const v = valor(o[k]);
        if (v !== undefined) f[k] = v;
      }
      return { i: id, f };
    };
    return { versao: 2, raiz: objeto(raiz) };
  }
  function restaurar(raiz, foto) {
    if (!foto || foto.versao !== 2) throw new Error('savestate de outra versão');
    const feitos = new Set();
    const novo = (n) => {           // valor guardado -> valor JS (pra campos sem objeto vivo)
      if (n === null || typeof n !== 'object') return n;
      if (n.a) return desTipado(n);
      if (n.l) return n.l.map(novo);
      return undefined;             // objeto sem par vivo: deixa como está
    };
    const em = (vivo, n) => {       // escreve o nó n no valor vivo; devolve o valor final
      if (n === null || typeof n !== 'object') return n;
      if (n.a) {
        const t = desTipado(n);
        // escreve DENTRO do array vivo: ele pode ser compartilhado (apu.ram = dsp.ram)
        if (ArrayBuffer.isView(vivo) && vivo.length === t.length && vivo.constructor.name === t.constructor.name) { vivo.set(t); return vivo; }
        return t;
      }
      if (n.l) {
        if (Array.isArray(vivo) && vivo.length === n.l.length) { for (let i = 0; i < n.l.length; i++) vivo[i] = em(vivo[i], n.l[i]); return vivo; }
        return novo(n);
      }
      if ('r' in n) return vivo;    // referência: a estrutura já é a mesma
      if (vivo && typeof vivo === 'object') { objeto(vivo, n); return vivo; }
      return vivo;
    };
    const objeto = (vivo, n) => {
      if (feitos.has(vivo)) return;
      feitos.add(vivo);
      for (const k of Object.keys(n.f)) vivo[k] = em(vivo[k], n.f[k]);
    };
    objeto(raiz, foto.raiz);
  }
  // ---------------- rebobinar ----------------
  // Fotos rápidas e pequenas, várias por segundo. Um "plano" lista uma vez os
  // arrays tipados e os campos simples do grafo; a "cabeça" é uma cópia do
  // estado. Cada foto guarda só o DESFAZER: os pedaços (64 palavras) que
  // mudaram desde a foto anterior, com o valor antigo. Voltar = aplicar o
  // desfazer na cabeça e copiar a cabeça pro console.
  const PEDACO = 64;
  function Rebobinador(raiz, limiteBytes, maxFotos) {
    let plano = null, cabeca = null, primsCab = null, fotos = [], bytes = 0;
    const palavras = (a) => (a.byteLength % 4 === 0 && a.byteOffset % 4 === 0
      ? new Int32Array(a.buffer, a.byteOffset, a.byteLength / 4) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    function planejar() {
      const arrs = [], prims = [], refs = [], vistos = new Set();
      const anda = (o) => {
        if (vistos.has(o)) return; vistos.add(o);
        for (const k of Object.keys(o)) {
          if (PULAR.has(k)) continue;
          const v = o[k];
          if (v === null || typeof v !== 'object') { if (typeof v !== 'function') prims.push([o, k]); continue; }
          refs.push([o, k, v]);
          if (ArrayBuffer.isView(v)) { if (!vistos.has(v)) { vistos.add(v); arrs.push(v); } } else anda(v);
        }
      };
      anda(raiz);
      plano = { arrs, prims, refs, vivas: arrs.map(palavras) };
      cabeca = plano.vivas.map((w) => w.slice());
      primsCab = prims.map(([o, k]) => o[k]);
      fotos = []; bytes = 0;
    }
    // o núcleo trocou algum objeto/array de lugar? então o plano velho não vale
    const mudouEstrutura = () => plano.refs.some(([o, k, v]) => o[k] !== v);
    function gravar() {
      if (!plano || mudouEstrutura()) { planejar(); return; }
      const pedacos = [];
      let tam = 0;
      for (let i = 0; i < cabeca.length; i++) {
        const h = cabeca[i], w = plano.vivas[i], n = w.length;
        for (let ini = 0; ini < n; ini += PEDACO) {
          const fim = Math.min(n, ini + PEDACO);
          let p = ini;
          while (p < fim && h[p] === w[p]) p++;
          if (p === fim) continue;
          pedacos.push(i, ini, h.slice(ini, fim));          // valor antigo
          h.set(w.subarray(ini, fim), ini);
          tam += (fim - ini) * h.BYTES_PER_ELEMENT + 24;
        }
      }
      const antigos = primsCab;
      primsCab = plano.prims.map(([o, k]) => o[k]);
      fotos.push({ pedacos, prims: antigos, tam });
      bytes += tam + antigos.length * 8;
      while ((bytes > limiteBytes || fotos.length > (maxFotos || Infinity)) && fotos.length > 1) { const f = fotos.shift(); bytes -= f.tam + f.prims.length * 8; }
    }
    function escreverNoConsole() {
      for (let i = 0; i < cabeca.length; i++) plano.vivas[i].set(cabeca[i]);
      plano.prims.forEach(([o, k], j) => { o[k] = primsCab[j]; });
    }
    // volta uma foto; false quando não tem mais pra onde voltar
    function voltar() {
      if (!plano) return false;
      const f = fotos.pop();
      if (f) {
        const p = f.pedacos;
        for (let j = 0; j < p.length; j += 3) cabeca[p[j]].set(p[j + 2], p[j + 1]);
        primsCab = f.prims; bytes -= f.tam + f.prims.length * 8;
      }
      escreverNoConsole();
      return !!f;
    }
    return {
      gravar, voltar,
      limpar() { plano = null; fotos = []; bytes = 0; },
      get fotos() { return fotos.length; },
      get bytes() { return bytes; },
    };
  }
  return { capturar, restaurar, Rebobinador };
})();
if (typeof module !== 'undefined') module.exports = KofEstado;
