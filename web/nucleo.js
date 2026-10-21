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
    // NES: o núcleo entrega 256x240; aqui corta 8 linhas em cima e embaixo (o que a TV escondia). Som em alta qualidade:
    // é nesse modo que cada canal passa pela sonda do osciloscópio (nucleo-libretro/fceumm-sonda.patch)
    nes: { nome: 'NES', curto: 'NES', ext: ['nes'], nucleo: 'fceumm', largura: 256, altura: 224, tv43: true,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'Start', 'Select'], musica: false, minimo: 0x2010,
      canais: ['Pulso 1', 'Pulso 2', 'Triângulo', 'Ruído', 'DPCM'], papeis: ['quadrada', 'quadrada', 'triângulo 4 bits', 'LFSR', 'amostras'],
      escalas: [1 / 1920, 1 / 1920, 1 / 22.5, 1 / 15, 1 / 63.5], opcoes: { fceumm_sndquality: 'High' } },
    // Sega (Genesis Plus GX): a resolução muda no meio do jogo (Mega Drive 320 ou 256 de largura; alguns jogos de Master System
    // usam 224 linhas), então o tamanho é "dinâmico". A sonda (nucleo-libretro/genplus-sonda.patch) tem 10 canais: 0-5 FM,
    // 6-9 PSG; o Master System e o Game Gear só usam o PSG. Mudo por canal: as opções de volume do próprio núcleo.
    // O núcleo escolhe sozinho 3 ou 6 botões no Mega Drive (tem a lista dos jogos que só aceitam 3).
    md: { nome: 'Mega Drive', curto: 'MD', ext: ['md', 'gen', 'smd', 'bin'], nucleo: 'genplus', largura: 320, altura: 224, dinamico: true, tv43: true,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select'], musica: false, minimo: 0x200,
      canais: ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'PSG 1', 'PSG 2', 'PSG 3', 'Ruído'],
      papeis: ['FM', 'FM', 'FM', 'FM', 'FM', 'FM / amostras', 'quadrada', 'quadrada', 'quadrada', 'LFSR'],
      indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], escalas: [1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 2100, 1 / 2100, 1 / 2100, 1 / 2100] },
    sms: { nome: 'Master System', curto: 'SMS', ext: ['sms'], nucleo: 'genplus', largura: 256, altura: 192, dinamico: true, tv43: true,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'Start'], musica: false, minimo: 0x2000,
      canais: ['PSG 1', 'PSG 2', 'PSG 3', 'Ruído'], papeis: ['quadrada', 'quadrada', 'quadrada', 'LFSR'], indices: [6, 7, 8, 9], escalas: [1 / 2100, 1 / 2100, 1 / 2100, 1 / 2100] },
    // GBA (mGBA): BIOS opcional (o mGBA imita a BIOS sozinho); com a BIOS do usuário em /sistema aparece a abertura original.
    // Botões no mesmo lugar do SNES: A, B, L, R. Áudio a 65.536 Hz
    gba: { nome: 'Game Boy Advance', curto: 'GBA', ext: ['gba'], nucleo: 'mgba', largura: 240, altura: 160,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'L', 'R', 'Start', 'Select'], musica: false, minimo: 0xC0,
      bios: [{ arquivo: 'gba_bios.bin', tamanho: 16384, opcional: true }],
      canais: ['Pulso 1', 'Pulso 2', 'Onda', 'Ruído', 'Direct A', 'Direct B'], papeis: ['quadrada + sweep', 'quadrada', 'tabela 4 bits', 'LFSR', 'amostras PCM', 'amostras PCM'],
      escalas: [1 / 16, 1 / 16, 1 / 16, 1 / 16, 1 / 128, 1 / 128] },
    // Neo Geo (FBNeo só com o Neo Geo): o jogo é o zip inteiro do fliperama (mslug.zip), reconhecido pelo nome na lista do
    // FBNeo (neogeo-jogos.js); vai pro disco virtual /jogos com o zip do "pai" (clones) e a BIOS neogeo.zip em /sistema.
    // Modo AES (o console de casa: sem ficha) por padrão. Botões: A, B, C, D = B, A, Y, X do SNES; Select = Ficha
    neogeo: { nome: 'Neo Geo', curto: 'NEO', ext: [], nucleo: 'fbneo', largura: 320, altura: 224, dinamico: true, tv43: true, caminho: true,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'X', 'Y', 'Start', 'Select'], musica: false, minimo: 22,   // nomes do lado do SNES (no controle: A B C D e Ficha)
      bios: [{ arquivo: 'neogeo.zip' }], opcoes: { 'fbneo-neogeo-mode': 'AES_EUR' },
      // YM2610 (nucleo-libretro/fbneo-sonda.patch): 4 FM, 3 quadradas (SSG), 6 de amostras ADPCM-A (percussão, vozes) e 1 ADPCM-B
      canais: ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'SSG 1', 'SSG 2', 'SSG 3', 'ADPCM-A 1', 'ADPCM-A 2', 'ADPCM-A 3', 'ADPCM-A 4', 'ADPCM-A 5', 'ADPCM-A 6', 'ADPCM-B'],
      papeis: ['FM', 'FM', 'FM', 'FM', 'quadrada', 'quadrada', 'quadrada', 'amostras', 'amostras', 'amostras', 'amostras', 'amostras', 'amostras', 'amostras'],
      escalas: [1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 8192, 1 / 4096, 1 / 4096, 1 / 4096, 1 / 4096, 1 / 4096, 1 / 4096, 1 / 8192] },
    gg: { nome: 'Game Gear', curto: 'GG', ext: ['gg'], nucleo: 'genplus', largura: 160, altura: 144, dinamico: true, proporcao: 10 / 9,   // a tela do aparelho, quase quadrada
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'Start'], musica: false, minimo: 0x2000,
      canais: ['PSG 1', 'PSG 2', 'PSG 3', 'Ruído'], papeis: ['quadrada', 'quadrada', 'quadrada', 'LFSR'], indices: [6, 7, 8, 9], escalas: [1 / 2100, 1 / 2100, 1 / 2100, 1 / 2100] },
    // PlayStation (PCSX-ReARMed): o CD fica no disco virtual /jogos enquanto o jogo roda (o núcleo lê o CD aos poucos).
    // .cue precisa dos .bin junto (o app procura na pasta, nos arquivos soltos juntos ou pergunta). BIOS opcional: sem ela o
    // PCSX imita a BIOS (muitos jogos rodam; com a de verdade roda mais). Botões: ✕ ○ □ △ = B A Y X do SNES, L1/R1 = L/R
    ps1: { nome: 'PlayStation', curto: 'PS1', ext: ['cue', 'chd', 'pbp', 'iso', 'exe'], nucleo: 'pcsx', largura: 320, altura: 240, dinamico: true, tv43: true, caminho: true,
      botoes: ['Cima', 'Baixo', 'Esquerda', 'Direita', 'A', 'B', 'X', 'Y', 'L', 'R', 'Start', 'Select'], musica: false, minimo: 16, grande: true,   // o .cue é só um texto pequeno
      bios: ['scph5501.bin', 'scph1001.bin', 'scph7001.bin', 'scph5500.bin', 'scph5502.bin', 'scph101.bin', 'scph7502.bin', 'psxonpsp660.bin'].map((arquivo) => ({ arquivo, tamanho: 524288, opcional: true })),
      canais: [] },
  };
  const extensao = (nome) => (/\.([^.]+)$/.exec(nome || '') || [])[1]?.toLowerCase() || '';
  // set do Neo Geo pelo nome do zip ('mslug.zip' -> 'mslug'), se estiver na lista do FBNeo
  const NEOGEO = typeof KofNeoGeoJogos !== 'undefined' ? KofNeoGeoJogos : {};
  function setNeoGeo(nome) {
    const m = /([^/\\]+)\.zip$/i.exec(nome || '');
    return m && NEOGEO[m[1].toLowerCase()] ? m[1].toLowerCase() : null;
  }
  // zip com outro nome ("King of Fighters 98.zip"): o set sai dos CRCs que o próprio zip guarda (diretório central, sem
  // descompactar), comparados com os dos chips de programa de cada jogo. Ganha o set com TODOS os chips de programa no zip
  // (o que tiver mais chips, que é o mais específico); empate: o jogo original antes dos clones
  const NEOCRC = typeof KofNeoGeoCrc !== 'undefined' ? KofNeoGeoCrc : {};
  let progDoSet = null;
  function setNeoGeoDoZip(u8) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return null;
    const crcs = new Set();
    let p = v.getUint32(e + 16, true);
    for (let k = v.getUint16(e + 10, true); k > 0 && p + 46 <= u8.length && v.getUint32(p, true) === 0x02014b50; k--) {
      crcs.add(v.getUint32(p + 16, true).toString(16).padStart(8, '0'));
      p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    if (!progDoSet) { progDoSet = {}; for (const [c, sets] of Object.entries(NEOCRC)) for (const n of sets) (progDoSet[n] = progDoSet[n] || []).push(c); }
    const candidatos = new Set([].concat(...[...crcs].map((c) => NEOCRC[c] || [])));
    let melhor = null;
    for (const n of candidatos) {
      const prog = progDoSet[n] || [];
      if (!prog.every((c) => crcs.has(c))) continue;
      const pontos = prog.length * 2 + (NEOGEO[n] && !NEOGEO[n][1] ? 1 : 0);
      if (!melhor || pontos > melhor[1]) melhor = [n, pontos];
    }
    return melhor ? melhor[0] : null;
  }
  function sistemaDe(nome) {
    if (setNeoGeo(nome)) return 'neogeo';
    const e = extensao(nome);
    return Object.keys(SISTEMAS).find((k) => SISTEMAS[k].ext.includes(e)) || null;
  }
  const EXTENSOES = [].concat(...Object.values(SISTEMAS).map((s) => s.ext));
  // Cada núcleo mora num arquivo próprio do lado do html (nucleos/<núcleo>-<hash>.js; o hash muda quando o núcleo muda)
  // e só é carregado quando abre um jogo daquele console. O juntar.py escreve aqui a lista exata desta versão.
  // É <script src> e não fetch: o navegador bloqueia fetch de arquivo local (file://), script ele deixa.
  const ARQUIVOS = /*{{NUCLEOS}}*/ {};
  const fabrica = (n) => (typeof globalThis['Nucleo_' + n] === 'function' ? globalThis['Nucleo_' + n] : null);
  const disponivel = (sis) => !!(SISTEMAS[sis] && (fabrica(SISTEMAS[sis].nucleo) || ARQUIVOS[SISTEMAS[sis].nucleo]));
  const baixando = {};
  function buscar(n) {
    if (fabrica(n)) return Promise.resolve(fabrica(n));
    const arq = ARQUIVOS[n];
    if (!arq || typeof document === 'undefined') return Promise.reject(new Error('esse KOFstation não tem o núcleo ' + n));
    if (baixando[n]) return baixando[n];
    const sis = Object.values(SISTEMAS).filter((S) => S.nucleo === n).map((S) => S.nome).join('/');
    const faltou = () => new Error(`faltou baixar o núcleo do ${sis} (${arq}). `
      + (document.documentElement.classList.contains('celular') ? 'Instale o app de novo.' : 'Abra o KOFstation de novo, com internet, que ele baixa.'));
    baixando[n] = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = arq;
      s.onload = () => (fabrica(n) ? ok(fabrica(n)) : erro(faltou()));
      s.onerror = () => { s.remove(); erro(faltou()); };
      document.head.appendChild(s);
    }).catch((e) => { delete baixando[n]; throw e; });   // deu errado: na próxima tentativa procura de novo
    return baixando[n];
  }

  // BIOS do usuário (o app lê do banco e entrega aqui): núcleo -> {arquivo: bytes}; vai pro disco virtual /sistema antes do jogo
  const BIOS = {};
  function bios(nucleo, arquivo, bytes) { (BIOS[nucleo] = BIOS[nucleo] || {})[arquivo] = bytes; }
  const temBios = (sis) => (SISTEMAS[sis].bios || []).every((b) => b.opcional || (BIOS[SISTEMAS[sis].nucleo] || {})[b.arquivo]);
  // de qual sistema é esse arquivo de BIOS (pelo nome e, se tiver, pelo tamanho)
  function sistemaDaBios(nome, tamanho) {
    const n = (nome || '').toLowerCase();
    return Object.keys(SISTEMAS).find((k) => (SISTEMAS[k].bios || []).some((b) => b.arquivo === n && (!b.tamanho || b.tamanho === tamanho)))
      || Object.keys(SISTEMAS).find((k) => (SISTEMAS[k].bios || []).some((b) => b.tamanho && b.tamanho === tamanho)) || null;
  }
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
  // opções padrão de cada núcleo (as do sistema), por baixo das que o app escolher
  for (const S of Object.values(SISTEMAS)) if (S.opcoes) opcoes[S.nucleo] = Object.assign({}, S.opcoes, opcoes[S.nucleo]);
  // o que o núcleo escreve (ex.: o FBNeo diz qual arquivo do zip faltou) fica nas últimas linhas de m.kofLog, pro erro mostrar
  const novaInstancia = (nucleo, f) => {
    const log = [], anotar = (t) => { log.push(String(t)); if (log.length > 40) log.shift(); };
    return f({ print: anotar, printErr: anotar }).then((m) => { m.kofLog = log; instancias.push([nucleo, m]); passarOpcoes(m, nucleo); m._lr_init(); return m; });
  };
  const gravar = (mod, caminho, dados) => {
    const c = caminho + '\0', pc = mod._lr_alloc(c.length), pd = mod._lr_alloc(dados.length);
    for (let i = 0; i < c.length; i++) mod.HEAPU8[pc + i] = c.charCodeAt(i);
    mod.HEAPU8.set(dados, pd); const ok = mod._lr_arquivo(pc, pd, dados.length); mod._free(pc); mod._free(pd);
    return ok;
  };
  const apagar = (mod, caminho) => { const c = caminho + '\0', pc = mod._lr_alloc(c.length); for (let i = 0; i < c.length; i++) mod.HEAPU8[pc + i] = c.charCodeAt(i); mod._lr_apagar(pc); mod._free(pc); };
  async function iniciar(nucleo) {
    if (!modulos[nucleo]) modulos[nucleo] = buscar(nucleo).then((f) => novaInstancia(nucleo, f)).catch((e) => { delete modulos[nucleo]; throw e; });
    return modulos[nucleo];
  }

  // bits do registrador do controle do SNES (como o app.js usa) -> ids do libretro (B Y Select Start Cima Baixo Esq Dir A X L R).
  // No Game Boy o Gambatte só olha B, Select, Start, direcional e A: o mesmo mapa serve
  const LIGACAO = [[0x8000, 0], [0x4000, 1], [0x2000, 2], [0x1000, 3], [0x0800, 4], [0x0400, 5], [0x0200, 6], [0x0100, 7], [0x0080, 8], [0x0040, 9], [0x0020, 10], [0x0010, 11], [0x0008, 12], [0x0004, 13]];   // 12/13 = L2/R2 (PlayStation)
  const mascara = (b) => { let m = 0; for (const [bit, id] of LIGACAO) if (b & bit) m |= 1 << id; return m; };
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (t) => { const s = atob(t), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
  const texto = (rom, ini, n) => { let t = ''; for (let i = 0; i < n && ini + i < rom.length; i++) { const c = rom[ini + i]; t += c >= 32 && c < 127 ? String.fromCharCode(c) : ' '; } return t; };

  // título interno da ROM
  // NES não tem título no cartucho: vira "NES" + o CRC32 da ROM (sem o cabeçalho), que é o que identifica o jogo
  function crc32(u8, ini) {
    let c, crc = 0xFFFFFFFF;
    for (let i = ini; i < u8.length; i++) { c = (crc ^ u8[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }
  function titulo(rom, sis) {
    if (sis === 'neogeo' || sis === 'ps1') return '';   // vem do nome do arquivo (criar)
    if (sis === 'gba') {   // nome de 12 letras no cabeçalho (0xA0); sem nome, o CRC32
      const t = texto(rom, 0xA0, 12).trim();
      return /[A-Za-z0-9]{2}/.test(t) ? t : 'GBA ' + crc32(rom, 0);
    }
    if (sis === 'nes') return 'NES ' + crc32(rom, rom[0] === 0x4E && rom[1] === 0x45 && rom[2] === 0x53 ? 16 : 0);
    if (sis === 'sms' || sis === 'gg') return SISTEMAS[sis].curto + ' ' + crc32(rom, rom.length % 1024 === 512 ? 512 : 0);
    if (sis === 'md') {   // nome "internacional" do cabeçalho; sem ele (ou ROM .smd embaralhada), o CRC32
      const t = texto(rom, 0x150, 48).replace(/\s+/g, ' ').trim();
      return /[A-Za-z]{2}/.test(t) && texto(rom, 0x100, 4) === 'SEGA' ? t : 'MD ' + crc32(rom, 0);
    }
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
      const eu = this;
      let quadro = new Int32Array(S.largura * S.altura);
      this.ppu = { get frame() {                                  // formato do núcleo Kof (0xAARRGGBB), só quando alguém pede
        const o = eu.rgba;
        if (quadro.length !== o.length) quadro = new Int32Array(o.length);
        for (let i = 0; i < o.length; i++) { const c = o[i]; quadro[i] = (c & 0xFF00FF00) | ((c & 0xFF) << 16) | ((c >> 16) & 0xFF); }
        return quadro;
      } };
      this.apu = { dsp: { outBuf: new Int16Array(32768 * 2), outCount: 0 } };
      this.cpu = { pc: 0 };
      this.cart = { title: titulo(rom, sis), superfx: false, mapper: this.nucleo, sram: new Uint8Array(0), hasSram: () => false };
      this.extras = [];
      this.quadros = 0;
    }
    carregar() {
      const mod = this.mod, n = this.nucleo;
      if (mod.kofAtual && mod.kofAtual !== this) mod._lr_unload();   // cada instância do módulo roda um jogo por vez
      for (const [arq, dados] of Object.entries(BIOS[n] || {})) gravar(mod, '/sistema/' + arq, dados);
      if (SISTEMAS[this.sistema].caminho) return this.carregarPorCaminho();
      const p = mod._lr_alloc(this.rom.length);
      mod.HEAPU8.set(this.rom, p);
      const nome = 'rom.' + (this.sistema === 'gb' && (this.rom[0x143] & 0x80) ? 'gbc' : SISTEMAS[this.sistema].ext[0]) + '\0';
      const pn = mod._lr_alloc(nome.length);
      for (let i = 0; i < nome.length; i++) mod.HEAPU8[pn + i] = nome.charCodeAt(i);
      const ok = mod._lr_load(p, this.rom.length, pn);
      mod._free(p); mod._free(pn);
      if (!ok) throw new Error(`o ${n} não aceitou essa ROM`);
      this.depoisDeCarregar();
    }
    // núcleo que só abre o jogo por arquivo (FBNeo): o zip (e os do pai) vão pro disco virtual /jogos; depois de carregar,
    // saem de lá (o núcleo já copiou tudo pra memória dele) pra não ocupar a memória duas vezes
    carregarPorCaminho() {
      const mod = this.mod, S = SISTEMAS[this.sistema], ps1 = this.sistema === 'ps1';
      const principal = ps1 ? this.arquivo : this.set + '.zip', arqs = [[principal, this.rom], ...this.extras.map((e) => [e.nome, e.bytes])];
      // PlayStation: o CD do jogo anterior sai do disco virtual antes do novo entrar (cada CD pode ter 700 MB)
      for (const nome of mod.kofCd || []) apagar(mod, '/jogos/' + nome);
      mod.kofCd = [];
      for (const [nome, dados] of arqs) if (!gravar(mod, '/jogos/' + nome, dados)) throw new Error('faltou memória pra abrir ' + nome + (ps1 ? ' (CD grande demais: tente o jogo em .chd, que é comprimido)' : ''));
      if (ps1) { mod.kofCd = arqs.map(([n]) => n); this.rom = new Uint8Array(0); this.extras = []; }   // os bytes já estão no disco virtual
      const caminho = '/jogos/' + principal + '\0', pc = mod._lr_alloc(caminho.length);
      for (let i = 0; i < caminho.length; i++) mod.HEAPU8[pc + i] = caminho.charCodeAt(i);
      mod.kofLog.length = 0;
      let ok = mod._lr_load(0, 0, pc);
      if (!ok && S.opcoes && S.opcoes['fbneo-neogeo-mode'] && (opcoes[this.nucleo] || {})['fbneo-neogeo-mode'] !== 'DIPSWITCH') {
        // a BIOS do usuário não tem a do AES: tenta de novo com a BIOS que o neogeo.zip escolher sozinho (MVS)
        const antes = opcoes[this.nucleo]['fbneo-neogeo-mode'];
        opcoes[this.nucleo]['fbneo-neogeo-mode'] = 'DIPSWITCH'; passarOpcoes(mod, this.nucleo);
        ok = mod._lr_load(0, 0, pc);
        opcoes[this.nucleo]['fbneo-neogeo-mode'] = antes; passarOpcoes(mod, this.nucleo);
        if (ok) this.modoMvs = true;
      }
      mod._free(pc);
      if (!ps1) for (const [nome] of arqs) apagar(mod, '/jogos/' + nome);
      // o FBNeo às vezes "abre" só pra mostrar a tela de erro dele (driver não iniciou: estado de tamanho 0)
      if (ok && !mod._lr_state_size()) { mod._lr_unload(); ok = 0; }
      if (!ok && ps1) {
        const falta = mod.kofLog.filter((l) => /fail|error|missing|not found|could not/i.test(l)).slice(-2).join(' · ');
        throw new Error('o PlayStation não abriu esse jogo' + (falta ? ': ' + falta : /\.cue$/i.test(principal) ? ' (os arquivos .bin do .cue precisam vir junto)' : ''));
      }
      if (!ok) {
        const pai = (NEOGEO[this.set] || [])[1];
        if (pai && !this.extras.length) throw new Error(`esse jogo precisa também do ${pai}.zip (o jogo original de onde ele saiu): abra o ${pai}.zip uma vez ou deixe ele na pasta de ROMs`);
        const falta = mod.kofLog.filter((l) => /required|missing|not found|bad crc|error|failed/i.test(l)).slice(-3).join(' · ');
        throw new Error(`o ${S.nome} não abriu esse jogo` + (falta ? ': ' + falta : ' (confira o zip e o neogeo.zip)'));
      }
      this.depoisDeCarregar();
    }
    depoisDeCarregar() {
      const mod = this.mod;
      mod.kofAtual = this;
      const i = mod._lr_info() >> 3, info = mod.HEAPF64;
      this.fps = info[i + 5]; this.taxaAudio = info[i + 6]; this.proporcao = SISTEMAS[this.sistema].proporcao || info[i + 4];
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
      let w = mod._lr_w(), h = mod._lr_h();
      if (SISTEMAS[this.sistema].dinamico && w > 0 && h > 0 && (w !== this.largura || h !== this.altura)) {   // o jogo trocou de resolução
        this.largura = w; this.altura = h; this.rgba = new Uint32Array(w * h);
      }
      const L = this.largura, A = this.altura, o = this.rgba;
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
      const mod = this.mod;
      if (!mod._lr_state_save(this.estadoBuf, this.tamEstado)) {
        // o tamanho do estado mudou depois que o jogo começou (FBNeo): pergunta de novo e tenta mais uma vez
        const n = mod._lr_state_size();
        if (n !== this.tamEstado) { mod._free(this.estadoBuf); this.tamEstado = n; this.estadoBuf = mod._lr_alloc((n + 3) & ~3); }
        if (!mod._lr_state_save(this.estadoBuf, this.tamEstado)) throw new Error('não consegui guardar o estado');
      }
      return new Uint8Array(mod.HEAPU8.buffer, this.estadoBuf, this.tamEstado).slice();
    }
    desserializar(u8) {
      if (u8.length > this.tamEstado) { this.mod._free(this.estadoBuf); this.tamEstado = u8.length; this.estadoBuf = this.mod._lr_alloc((u8.length + 3) & ~3); }
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
  // extras: outros arquivos que o jogo precisa no disco virtual (Neo Geo: o zip do pai), [{nome, bytes}]
  function novoConsolinho(bytes, sis, nome, mod, extras) {
    const c = new Consolinho(SISTEMAS[sis].grande ? bytes : Uint8Array.from(bytes), sis, mod);   // CD de 700 MB: não copia
    if (sis === 'neogeo') { c.set = setNeoGeo(nome); c.cart.title = NEOGEO[c.set][0]; c.extras = extras || []; }
    if (sis === 'ps1') { c.arquivo = (nome || 'jogo.cue').replace(/^.*[\\/]/, ''); c.cart.title = c.arquivo.replace(/\.[^.]+$/, ''); c.extras = extras || []; }
    return c;
  }
  async function criar(bytes, nome, extras) {
    const sis = SISTEMAS[nome] ? nome : nome ? sistemaDe(nome) : 'snes';
    if (!sis) throw new Error('não conheço esse tipo de arquivo');
    if (!temBios(sis)) throw new Error('falta a BIOS do ' + SISTEMAS[sis].nome);
    const mod = await iniciar(SISTEMAS[sis].nucleo);
    const c = novoConsolinho(bytes, sis, nome, mod, extras);
    c.carregar();
    return c;
  }
  // jukebox: toca a música de um estado guardado, numa instância SEPARADA do núcleo (o jogo aberto não é tocado),
  // sem imagem e sem botão apertado; a sonda do núcleo entrega a onda de cada canal e o mudo por canal
  async function tocador(sis, rom, estadoB64, nome, extras) {
    const S = SISTEMAS[sis], chave = S.nucleo + ':jukebox';
    if (!modulos[chave]) modulos[chave] = buscar(S.nucleo).then((f) => novaInstancia(S.nucleo, f)).catch((e) => { delete modulos[chave]; throw e; });
    const mod = await modulos[chave];
    const c = novoConsolinho(rom, sis, nome, mod, extras);
    c.carregar();
    // sem estado: a ROM é a própria música (a trilha do KOFstation no som do Mega Drive) e toca desde o começo
    if (estadoB64 && !c.desserializar(deB64(estadoB64))) throw new Error('não consegui restaurar a música');
    mod._lr_pad(0); mod._lr_sonda(1);
    const total = mod._lr_canais(), tam = 4096, idx = S.indices || [...Array(total).keys()], n = total ? Math.min(idx.length, S.canais.length) : 0;
    const varNucleo = (k, v) => {
      const t = k + '\0' + v + '\0', p = mod._lr_alloc(t.length);
      for (let i = 0; i < t.length; i++) mod.HEAPU8[p + i] = t.charCodeAt(i);
      mod._lr_var(p, p + k.length + 1); mod._free(p);
    };
    // Genesis Plus GX: o mudo de cada canal é a opção de volume dele (só nesta instância da jukebox, o jogo não muda)
    const mudoGenplus = (m) => idx.slice(0, n).forEach((c, l) => varNucleo(c < 6 ? `genesis_plus_gx_md_channel_${c}_volume` : `genesis_plus_gx_psg_channel_${c - 6}_volume`, m & (1 << l) ? '0' : '100'));
    // taxa da onda: o FCEUmm/Gambatte gravam ~32 kHz; o Genesis Plus GX, ~26,6 kHz (metade do chip FM)
    const taxaOnda = S.nucleo === 'genplus' ? 26633 : S.nucleo === 'fceumm' ? 1789773 / 56 : S.nucleo === 'fbneo' ? 8000000 / 144 : 32768;
    return {
      sis, canais: n, nomes: S.canais.slice(0, n), papeis: (S.papeis || []).slice(0, n), taxa: c.taxaAudio,
      encher() { mod._lr_run(1, 0); return { b: new Int16Array(mod.HEAPU8.buffer, mod._lr_audio(), mod._lr_audio_n() * 2), n: mod._lr_audio_n() * 2 }; },
      limpar() {},
      mudas(m) { if (S.nucleo === 'genplus') mudoGenplus(m); else mod._lr_mudas(m); },
      // onda do canal v: anel de 4096 amostras na taxa do áudio; escala: amplitude máxima do canal = 1
      onda(v) { const c = idx[v]; return { buf: new Int16Array(mod.HEAPU8.buffer, mod._lr_onda(), total * tam), base: c * tam, tam, pos: mod._lr_onda_pos_c(c), escala: (S.escalas || [])[v] || 1 / 7680, taxa: taxaOnda }; },
      nivel: null,
      fechar() { mod._lr_sonda(0); this.mudas(0); },
    };
  }
  return { criar, iniciar, titulo, sistemaDe, disponivel, tocador, opcao, bios, temBios, sistemaDaBios, setNeoGeo, setNeoGeoDoZip, NEOGEO, SISTEMAS, EXTENSOES, ARQUIVOS };
})();
if (typeof module !== 'undefined') module.exports = KofLibretro;
