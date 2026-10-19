// Núcleos libretro (WebAssembly) com a mesma cara do núcleo Kof: Snes9x pro SNES, Gambatte pro Game Boy.
// O app.js só conversa com "pad / runFrame / ppu.frame / apu.dsp / cart / reset"; aqui o núcleo libretro
// responde a tudo isso, e o savestate e o rebobinar usam o serializador do próprio núcleo.
// A ponte (nucleo-libretro/ponte.cpp) é a mesma pra todos; tamanho da tela, fps e taxa de áudio vêm do núcleo.
// Licenças: Snes9x só NÃO comercial; Gambatte GPL-2 (nucleo-libretro/LEIA-ME.md).
const KofLibretro = (() => {
  'use strict';
  // sistemas que o app conhece: extensões, núcleo, tamanho da imagem que o app recebe e o que muda na interface
  const SISTEMAS = {
    snes: { nome: 'Super Nintendo', curto: 'SNES', ext: ['sfc', 'smc', 'fig', 'swc'], nucleo: 'snes9x', largura: 256, altura: 224,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select'], musica: true, minimo: 0x8000,
      canais: ['Voz 1', 'Voz 2', 'Voz 3', 'Voz 4', 'Voz 5', 'Voz 6', 'Voz 7', 'Voz 8'] },
    gb: { nome: 'Game Boy', curto: 'GB', ext: ['gb', 'gbc', 'sgb'], nucleo: 'gambatte', largura: 160, altura: 144,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'Start', 'Select'], musica: false, minimo: 0x4000,
      canais: ['Pulso 1', 'Pulso 2', 'Onda', 'Ruído'], papeis: ['quadrada + sweep', 'quadrada', 'tabela 4 bits', 'LFSR'] },
  };
  const extensao = (nome) => (/\.([^.]+)$/.exec(nome || '') || [])[1]?.toLowerCase() || '';
  function sistemaDe(nome) {
    const e = extensao(nome);
    return Object.keys(SISTEMAS).find((k) => SISTEMAS[k].ext.includes(e)) || null;
  }
  const EXTENSOES = [].concat(...Object.values(SISTEMAS).map((s) => s.ext));
  // núcleo compilado presente no html (o juntar.py só embute os que existem)
  const fabrica = (n) => (typeof globalThis['Nucleo_' + n] === 'function' ? globalThis['Nucleo_' + n] : null);
  const disponivel = (sis) => !!(SISTEMAS[sis] && fabrica(SISTEMAS[sis].nucleo));

  const modulos = {};
  // opções dos núcleos (as do libretro, ex.: paleta do Game Boy): valem pra todas as instâncias, também as que nascerem depois
  const opcoes = {};
  const instancias = [];
  function passarOpcoes(m, nucleo) {
    for (const [k, v] of Object.entries(opcoes[nucleo] || {})) {
      const t = k + '\0' + v + '\0', p = m._lr_alloc(t.length);
      for (let i = 0; i < t.length; i++) m.HEAPU8[p + i] = t.charCodeAt(i);
      m._lr_var(p, p + k.length + 1); m._free(p);
    }
  }
  function opcao(nucleo, valores) {
    opcoes[nucleo] = Object.assign(opcoes[nucleo] || {}, valores);
    for (const [n, m] of instancias) if (n === nucleo) passarOpcoes(m, n);
  }
  const novaInstancia = (nucleo, f) => f({ print: () => {}, printErr: () => {} }).then((m) => { instancias.push([nucleo, m]); passarOpcoes(m, nucleo); m._lr_init(); return m; });
  async function iniciar(nucleo) {
    if (modulos[nucleo]) return modulos[nucleo];
    const f = fabrica(nucleo);
    if (!f) throw new Error('esse KOFstation não tem o núcleo ' + nucleo);
    modulos[nucleo] = novaInstancia(nucleo, f);
    return modulos[nucleo];
  }

  // bits do registrador do controle do SNES (como o app.js usa) -> ids do libretro (B Y Select Start Cima Baixo Esq Dir A X L R).
  // No Game Boy o Gambatte só olha B, Select, Start, direcional e A: o mesmo mapa serve
  const LIGACAO = [[0x8000, 0], [0x4000, 1], [0x2000, 2], [0x1000, 3], [0x0800, 4], [0x0400, 5], [0x0200, 6], [0x0100, 7], [0x0080, 8], [0x0040, 9], [0x0020, 10], [0x0010, 11]];
  const mascara = (b) => { let m = 0; for (const [bit, id] of LIGACAO) if (b & bit) m |= 1 << id; return m; };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (t) => { const s = atob(t), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
  const texto = (rom, ini, n) => { let t = ''; for (let i = 0; i < n && ini + i < rom.length; i++) { const c = rom[ini + i]; t += c >= 32 && c < 127 ? String.fromCharCode(c) : ' '; } return t; };

  // título interno da ROM
  function titulo(rom, sis) {
    if ((sis || 'snes') === 'gb') return texto(rom, 0x134, rom[0x143] & 0x80 ? 15 : 16);   // GBC usa o último byte como marca
    const extra = rom.length % 1024 === 512 ? 512 : 0;   // ROM de SNES com cabeçalho de copiador tem 512 bytes a mais
    const ok = (o) => o + 0x20 <= rom.length && ((rom[o + 0x1C] | rom[o + 0x1D] << 8) ^ (rom[o + 0x1E] | rom[o + 0x1F] << 8)) === 0xFFFF;
    const base = [0x7FC0, 0xFFC0, 0x40FFC0].map((o) => o + extra).find(ok) ?? 0x7FC0 + extra;
    return texto(rom, base, 21);
  }

  class Consolinho {
    constructor(rom, sis, mod) {
      const S = SISTEMAS[sis];
      this.lr = true; this.sistema = sis; this.nucleo = S.nucleo; this.s9x = S.nucleo === 'snes9x';
      this.mod = mod; this.rom = rom; this.pad = [0, 0];
      this.largura = S.largura; this.altura = S.altura;
      this.rgba = new Uint32Array(S.largura * S.altura);      // já no formato do canvas (0xAABBGGRR)
      const eu = this, quadro = new Int32Array(S.largura * S.altura);
      this.ppu = { get frame() {                                  // formato do núcleo Kof (0xAARRGGBB), só quando alguém pede
        const o = eu.rgba;
        for (let i = 0; i < o.length; i++) { const c = o[i]; quadro[i] = (c & 0xFF00FF00) | ((c & 0xFF) << 16) | ((c >> 16) & 0xFF); }
        return quadro;
      } };
      this.apu = { dsp: { outBuf: new Int16Array(32768 * 2), outCount: 0 } };
      this.cpu = { pc: 0 };
      this.cart = { title: titulo(rom, sis), superfx: false, mapper: this.nucleo, sram: new Uint8Array(0), hasSram: () => false };
      this.quadros = 0;
    }
    carregar() {
      const mod = this.mod, n = this.nucleo;
      if (mod.kofAtual && mod.kofAtual !== this) mod._lr_unload();   // cada instância do módulo roda um jogo por vez
      const p = mod._lr_alloc(this.rom.length);
      mod.HEAPU8.set(this.rom, p);
      const nome = 'rom.' + (this.sistema === 'gb' && (this.rom[0x143] & 0x80) ? 'gbc' : SISTEMAS[this.sistema].ext[0]) + '\0';
      const pn = mod._lr_alloc(nome.length);
      for (let i = 0; i < nome.length; i++) mod.HEAPU8[pn + i] = nome.charCodeAt(i);
      const ok = mod._lr_load(p, this.rom.length, pn);
      mod._free(p); mod._free(pn);
      if (!ok) throw new Error(`o ${n} não aceitou essa ROM`);
      mod.kofAtual = this;
      const i = mod._lr_info() >> 3, info = mod.HEAPF64;
      this.fps = info[i + 5]; this.taxaAudio = info[i + 6]; this.proporcao = info[i + 4];
      this.tamEstado = mod._lr_state_size();
      this.estadoBuf = mod._lr_alloc((this.tamEstado + 3) & ~3);
      // bateria: RAM do cartucho e, no Game Boy, o relógio (RTC) logo depois; o app lê e grava sram[i]
      const partes = [0, 1].map((id) => [mod._lr_mem_ptr(id), mod._lr_mem_size(id)]).filter(([ptr, t]) => ptr && t);
      const total = partes.reduce((s, [, t]) => s + t, 0);
      const onde = (k) => { k = +k; for (const [ptr, t] of partes) { if (k < t) return ptr + k; k -= t; } return -1; };
      this.cart.sram = total ? new Proxy({ length: total }, {   // a memória do wasm pode crescer: sempre relê o HEAPU8
        get: (o, k) => (k === 'length' ? total : (onde(k) >= 0 ? mod.HEAPU8[onde(k)] : undefined)),
        set: (o, k, v) => { const a = onde(k); if (a >= 0) mod.HEAPU8[a] = v; return true; },
      }) : new Uint8Array(0);
      this.cart.hasSram = () => total > 0;
    }
    reset() { this.mod._lr_reset(); }
    runFrame() {
      const mod = this.mod;
      mod._lr_pad(mascara(this.pad[0]));
      mod._lr_run(1, 1);
      this.quadros++;
      const w = mod._lr_w(), h = mod._lr_h(), L = this.largura, A = this.altura, o = this.rgba;
      const fb = new Uint32Array(mod.HEAPU8.buffer, mod._lr_fb(), w * h);
      if (w === L && h === A) o.set(fb);
      else {   // SNES em alta resolução (512 de largura, 448/478 de altura) ou com 239 linhas: reduz/centraliza pra 256x224
        const px = w >= L * 2 ? 2 : 1, py = h >= A * 2 ? 2 : 1, y0 = py === 1 && h > A ? Math.floor((h - A) / 2) : 0;
        for (let y = 0; y < A; y++) {
          const lin = Math.min(h - 1, y * py + y0) * w;
          for (let x = 0; x < L; x++) o[y * L + x] = x * px < w ? fb[lin + x * px] : 0xFF000000;
        }
      }
      const d = this.apu.dsp, n = mod._lr_audio_n() * 2;
      if (d.outCount + n <= d.outBuf.length) {
        d.outBuf.set(new Int16Array(mod.HEAPU8.buffer, mod._lr_audio(), n), d.outCount);
        d.outCount += n;
      }
    }
    // música do jogo (só SNES): o estado do Snes9x tem o bloco "SND" (RAM do SPC700 + registradores + DSP); dele sai um
    // arquivo .spc (o mesmo formato que a Jukebox já toca e exporta), com os campos de controle ($F0-$FF) tirados dos timers
    gravarSpc(tag) {
      if (!this.s9x) throw new Error('guardar música é só do Super Nintendo');
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
    // savestate: bytes do núcleo
    serializar() {
      const n = this.tamEstado, mod = this.mod;
      if (!mod._lr_state_save(this.estadoBuf, n)) throw new Error('não consegui guardar o estado');
      return new Uint8Array(mod.HEAPU8.buffer, this.estadoBuf, n).slice();
    }
    desserializar(u8) {
      this.mod.HEAPU8.set(u8, this.estadoBuf);
      return !!this.mod._lr_state_load(this.estadoBuf, u8.length);
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

  // KofEstado fala com o núcleo libretro quando o objeto é dele; com o núcleo Kof continua igual.
  // Estado do Snes9x continua com a marca s9x (os estados e pacotes de bug antigos do celular abrem igual)
  if (typeof KofEstado !== 'undefined') {
    const cap = KofEstado.capturar, res = KofEstado.restaurar, reb = KofEstado.Rebobinador;
    KofEstado.capturar = (r) => (r && r.lr ? Object.assign(r.s9x ? { s9x: 1 } : {}, { lr: r.nucleo, d: b64(r.serializar()) }) : cap(r));
    KofEstado.restaurar = (r, o) => {
      if (!r || !r.lr) return res(r, o);
      if ((o.lr || (o.s9x ? 'snes9x' : 'kof')) !== r.nucleo) throw new Error('esse estado é de outro núcleo');
      r.desserializar(deB64(o.d));
    };
    KofEstado.Rebobinador = (r, lim, max) => (r && r.lr ? Rebobinador(r, lim, max) : reb(r, lim, max));
  }

  // o sistema vem pelo id ('snes', 'gb') ou pelo nome do arquivo (sem nenhum dos dois: SNES, como era antes)
  async function criar(bytes, nome) {
    const sis = SISTEMAS[nome] ? nome : nome ? sistemaDe(nome) : 'snes';
    if (!sis) throw new Error('não conheço esse tipo de arquivo');
    const mod = await iniciar(SISTEMAS[sis].nucleo);
    const c = new Consolinho(Uint8Array.from(bytes), sis, mod);
    c.carregar();
    return c;
  }
  // jukebox: toca a música de um estado guardado, numa instância SEPARADA do núcleo (o jogo aberto não é tocado),
  // sem imagem e sem botão apertado; a sonda do núcleo entrega a onda de cada canal e o mudo por canal
  async function tocador(sis, rom, estadoB64) {
    const S = SISTEMAS[sis], f = fabrica(S.nucleo), chave = S.nucleo + ':jukebox';
    if (!f) throw new Error('esse KOFstation não tem o núcleo ' + S.nucleo);
    if (!modulos[chave]) modulos[chave] = novaInstancia(S.nucleo, f);
    const mod = await modulos[chave];
    const c = new Consolinho(Uint8Array.from(rom), sis, mod);
    c.carregar();
    if (!c.desserializar(deB64(estadoB64))) throw new Error('não consegui restaurar a música');
    mod._lr_pad(0); mod._lr_sonda(1);
    const n = mod._lr_canais(), tam = 4096;
    return {
      sis, canais: n, nomes: S.canais.slice(0, n), papeis: (S.papeis || []).slice(0, n), taxa: c.taxaAudio,
      encher() { mod._lr_run(1, 0); return { b: new Int16Array(mod.HEAPU8.buffer, mod._lr_audio(), mod._lr_audio_n() * 2), n: mod._lr_audio_n() * 2 }; },
      limpar() {},
      mudas(m) { mod._lr_mudas(m); },
      // onda do canal v: anel de 4096 amostras na taxa do áudio; escala: amplitude máxima do canal = 1
      onda(v) { return { buf: new Int16Array(mod.HEAPU8.buffer, mod._lr_onda(), 4 * tam), base: v * tam, tam, pos: mod._lr_onda_pos(), escala: 1 / 7680 }; },
      nivel: null,
      fechar() { mod._lr_sonda(0); mod._lr_mudas(0); },
    };
  }
  return { criar, iniciar, titulo, sistemaDe, disponivel, tocador, opcao, SISTEMAS, EXTENSOES };
})();
if (typeof module !== 'undefined') module.exports = KofLibretro;
