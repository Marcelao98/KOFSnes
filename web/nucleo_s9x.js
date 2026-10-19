// Núcleo Snes9x (WebAssembly) com a mesma cara do núcleo Kof: é o núcleo do KOFnes no celular.
// O app.js só conversa com "snes.pad / runFrame / ppu.frame / apu.dsp / cart / reset"; aqui o Snes9x
// responde a tudo isso, e o savestate e o rebobinar usam o serializador do próprio Snes9x.
// Só entra no KOFnes-android.html. O Snes9x tem licença só pra uso NÃO comercial (nucleo-snes9x/LICENCA-SNES9X.txt).
const KofS9x = (() => {
  'use strict';
  let mod = null, atual = null;
  const L = 256, A = 224;
  // bits do registrador do controle do SNES (como o app.js usa) -> ids do libretro
  const LIGACAO = [[0x8000, 0], [0x4000, 1], [0x2000, 2], [0x1000, 3], [0x0800, 4], [0x0400, 5], [0x0200, 6], [0x0100, 7], [0x0080, 8], [0x0040, 9], [0x0020, 10], [0x0010, 11]];
  const mascara = (b) => { let m = 0; for (const [bit, id] of LIGACAO) if (b & bit) m |= 1 << id; return m; };

  async function iniciar() {
    if (mod) return mod;
    mod = await Snes9xModulo();
    mod._s9x_init();
    return mod;
  }
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (t) => { const s = atob(t), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };

  // título interno da ROM (21 bytes do cabeçalho; ROM com cabeçalho de copiador tem 512 bytes a mais)
  function titulo(rom) {
    const extra = rom.length % 1024 === 512 ? 512 : 0;
    const ok = (o) => o + 0x20 <= rom.length && ((rom[o + 0x1C] | rom[o + 0x1D] << 8) ^ (rom[o + 0x1E] | rom[o + 0x1F] << 8)) === 0xFFFF;
    const base = [0x7FC0, 0xFFC0, 0x40FFC0].map((o) => o + extra).find(ok) ?? 0x7FC0 + extra;
    let t = '';
    for (let i = 0; i < 21 && base + i < rom.length; i++) { const c = rom[base + i]; t += c >= 32 && c < 127 ? String.fromCharCode(c) : ' '; }
    return t;
  }

  class Consolinho {
    constructor(rom) {
      this.s9x = true;
      this.pad = [0, 0];
      this.ppu = { frame: new Int32Array(L * A) };
      this.apu = { dsp: { outBuf: new Int16Array(16384 * 2), outCount: 0 } };
      this.cpu = { pc: 0 };
      this.cart = { title: titulo(rom), superfx: false, mapper: 's9x', sram: new Uint8Array(0), hasSram: () => this.cart.sram.length > 0 };
      this.rom = rom;
      this.quadros = 0;
    }
    carregar() {
      if (atual && atual !== this) mod._s9x_unload();
      const p = mod._s9x_alloc(this.rom.length);
      mod.HEAPU8.set(this.rom, p);
      const ok = mod._s9x_load(p, this.rom.length);
      mod._free(p);
      if (!ok) throw new Error('o Snes9x não aceitou essa ROM');
      atual = this;
      this.tamEstado = mod._s9x_state_size();
      this.estadoBuf = mod._s9x_alloc((this.tamEstado + 3) & ~3);
      const n = mod._s9x_sram_size(), ptr = mod._s9x_sram_ptr();
      this.sramPtr = ptr; this.sramTam = n;
      this.cart.sram = n ? new Proxy({ length: n }, {   // o app lê e grava sram[i]; a memória pode crescer, então relê o buffer
        get: (o, k) => (k === 'length' ? n : mod.HEAPU8[ptr + (+k)]),
        set: (o, k, v) => { mod.HEAPU8[ptr + (+k)] = v; return true; },
      }) : new Uint8Array(0);
      this.cart.hasSram = () => n > 0;
    }
    reset() { mod._s9x_reset(); }
    runFrame() {
      mod._s9x_pad(mascara(this.pad[0]));
      mod._s9x_run(1, 1);
      this.quadros++;
      const w = mod._s9x_w(), h = mod._s9x_h(), fb = new Uint32Array(mod.HEAPU8.buffer, mod._s9x_fb(), w * h), f = this.ppu.frame;
      const passo = w >= 512 ? 2 : 1, y0 = h > A ? Math.floor((h - A) / 2) : 0;
      for (let y = 0; y < A; y++) {
        const lin = Math.min(h - 1, y * (h >= 448 ? 2 : 1) + (h >= 448 ? 0 : y0)) * w;
        for (let x = 0; x < L; x++) {
          const c = fb[lin + x * passo];                       // 0xAABBGGRR (formato do canvas)
          f[y * L + x] = (c & 0xFF00FF00) | ((c & 0xFF) << 16) | ((c >> 16) & 0xFF);   // -> 0xAARRGGBB, que é o que o app espera
        }
      }
      const d = this.apu.dsp, n = mod._s9x_audio_n() * 2;
      if (d.outCount + n <= d.outBuf.length) {
        d.outBuf.set(new Int16Array(mod.HEAPU8.buffer, mod._s9x_audio(), n), d.outCount);
        d.outCount += n;
      }
    }
    // música do jogo: o estado do Snes9x tem o bloco "SND" (RAM do SPC700 + registradores + DSP); dele sai um arquivo .spc
    // (o mesmo formato que a Jukebox já toca e exporta), com os campos de controle ($F0-$FF) tirados dos timers do SPC700
    gravarSpc(tag) {
      const st = this.serializar(), txt = (a, n) => String.fromCharCode.apply(null, st.subarray(a, a + n));
      let p = txt(0, 14).startsWith('#!s9xsnp') ? 14 : -1, snd = -1;
      while (p > 0 && p + 11 < st.length) {
        const nome = txt(p, 3), len = parseInt(txt(p + 4, 6), 10);
        if (!(len >= 0)) break;
        if (nome === 'SND') { snd = p + 11; break; }
        p += 11 + len;
      }
      if (snd < 0) throw new Error('não achei o estado do chip de som');
      const dv = new DataView(st.buffer, st.byteOffset + snd, 66560), I = (k) => dv.getInt32(65536 + 4 * k, true);
      const ram = st.subarray(snd, snd + 65536), regs = st.subarray(snd + 65700, snd + 65700 + 128);
      const apu = {
        ram, dsp: { regs }, iplEnabled: I(16) !== 0, dspAddr: I(17),
        tOn: [I(20) !== 0, I(25) !== 0, I(30) !== 0], tTarget: [I(21), I(26), I(31)], tOut: [I(24), I(29), I(34)],
        inPorts: [ram[0xF4], ram[0xF5], ram[0xF6], ram[0xF7]],
        spc: { pc: I(3) & 0xFFFF, a: I(5) & 0xFF, x: I(6) & 0xFF, y: I(7) & 0xFF, sp: I(4) & 0xFF,
          getPsw: () => (I(8) << 7) | (I(9) << 6) | (I(10) << 5) | (I(11) << 4) | (I(12) << 3) | (I(13) << 2) | (I(14) << 1) | I(15) },
      };
      return KofSpc.gravar(apu, tag);
    }
    // savestate: bytes do Snes9x
    serializar() {
      const n = this.tamEstado;
      if (!mod._s9x_state_save(this.estadoBuf, n)) throw new Error('não consegui guardar o estado');
      return new Uint8Array(mod.HEAPU8.buffer, this.estadoBuf, n).slice();
    }
    desserializar(u8) {
      mod.HEAPU8.set(u8, this.estadoBuf);
      return !!mod._s9x_state_load(this.estadoBuf, u8.length);
    }
  }

  // rebobinar: guarda o estado mais recente inteiro e, de cada foto, só os pedaços que mudaram (o valor antigo)
  function Rebobinador(s, limiteBytes, maxFotos) {
    const PEDACO = 4096;
    let cabeca = null, fotos = [], bytes = 0;
    const palavras = (u8) => new Int32Array(u8.buffer, u8.byteOffset, u8.byteLength >> 2);
    function gravar() {
      const novo = s.serializar(), pad = new Uint8Array((novo.length + 3) & ~3); pad.set(novo);
      if (!cabeca || cabeca.length !== pad.length) { cabeca = pad; fotos = []; bytes = 0; return; }
      const h = palavras(cabeca), w = palavras(pad), pedacos = [];
      let tam = 0;
      for (let ini = 0; ini < w.length; ini += PEDACO) {
        const fim = Math.min(w.length, ini + PEDACO);
        let p = ini; while (p < fim && h[p] === w[p]) p++;
        if (p === fim) continue;
        pedacos.push(ini, h.slice(ini, fim)); tam += (fim - ini) * 4 + 16;
      }
      cabeca = pad;
      fotos.push({ pedacos, tam }); bytes += tam;
      while ((bytes > limiteBytes || fotos.length > (maxFotos || Infinity)) && fotos.length > 1) bytes -= fotos.shift().tam;
    }
    function voltar() {
      if (!cabeca) return false;
      const f = fotos.pop();
      if (f) { const h = palavras(cabeca); for (let j = 0; j < f.pedacos.length; j += 2) h.set(f.pedacos[j + 1], f.pedacos[j]); bytes -= f.tam; }
      s.desserializar(cabeca.subarray(0, s.tamEstado));
      return !!f;
    }
    return { gravar, voltar, limpar() { cabeca = null; fotos = []; bytes = 0; }, get fotos() { return fotos.length; }, get bytes() { return bytes; } };
  }

  // KofEstado fala com o Snes9x quando o objeto é dele; com o núcleo Kof continua igual
  if (typeof KofEstado !== 'undefined') {
    const cap = KofEstado.capturar, res = KofEstado.restaurar, reb = KofEstado.Rebobinador;
    KofEstado.capturar = (r) => (r && r.s9x ? { s9x: 1, d: b64(r.serializar()) } : cap(r));
    KofEstado.restaurar = (r, o) => { if (r && r.s9x) { if (!o.s9x) throw new Error('esse estado é de outro núcleo'); r.desserializar(deB64(o.d)); } else res(r, o); };
    KofEstado.Rebobinador = (r, lim, max) => (r && r.s9x ? Rebobinador(r, lim, max) : reb(r, lim, max));
  }

  async function criar(bytes) {
    await iniciar();
    const c = new Consolinho(Uint8Array.from(bytes));
    c.carregar();
    return c;
  }
  return { criar, iniciar, titulo };
})();
if (typeof module !== 'undefined') module.exports = KofS9x;
