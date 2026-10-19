// Testa a ponte libretro (nucleo-libretro/ponte.cpp) direto no Node, sem o app: carrega a ROM, lê o av_info,
// roda quadros e confere imagem, áudio, savestate determinístico e memória da bateria.
//   node testes/libretro/ponte.cjs gambatte rom.gb [print.png]
//   node testes/libretro/ponte.cjs snes9x rom.sfc
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..', '..');
const [nome, arq, print] = process.argv.slice(2);
const Modulo = require(path.join(raiz, 'nucleo-libretro/saida', nome + '.js'));
(async () => {
  const m = await Modulo({ print: () => {}, printErr: () => {} }), r = { nucleo: nome };
  m._lr_init();
  const rom = fs.readFileSync(arq), p = m._lr_alloc(rom.length);
  m.HEAPU8.set(rom, p);
  const n = m.lengthBytesUTF8(path.basename(arq)) + 1, pn = m._lr_alloc(n);
  m.stringToUTF8(path.basename(arq), pn, n);
  r.carregou = !!m._lr_load(p, rom.length, pn);
  const info = Array.from(m.HEAPF64.subarray(m._lr_info() >> 3, (m._lr_info() >> 3) + 7));
  r.info = { base: info[0] + 'x' + info[1], max: info[2] + 'x' + info[3], proporcao: +info[4].toFixed(3), fps: +info[5].toFixed(3), taxaAudio: Math.round(info[6]) };
  const quadro = () => new Uint32Array(m.HEAPU8.buffer, m._lr_fb(), m._lr_w() * m._lr_h());
  const hash = () => { let t = 0; for (const v of quadro()) t = (Math.imul(t, 31) + v) | 0; return t; };
  let audio = 0, naoMudo = false;
  for (let i = 0; i < 300; i++) {
    m._lr_run(1, 1);
    const k = m._lr_audio_n(); audio += k;
    if (!naoMudo) naoMudo = new Int16Array(m.HEAPU8.buffer, m._lr_audio(), k * 2).some((v) => v !== 0);
  }
  r.tela = m._lr_w() + 'x' + m._lr_h();
  r.cores = new Set(quadro()).size;
  r.audioPorQuadro = Math.round(audio / 300);
  r.audioBateComTaxa = Math.abs(audio / 300 - info[6] / info[5]) < 2;
  r.audioNaoMudo = naoMudo;
  // savestate: guarda, anda 120 quadros apertando botões, restaura, anda de novo: mesma imagem
  const tam = m._lr_state_size(), ps = m._lr_alloc(tam);
  r.bytesEstado = tam;
  r.guardou = !!m._lr_state_save(ps, tam);
  const anda = () => { for (let i = 0; i < 120; i++) { m._lr_pad(i % 7 ? 1 << 8 : 1 << 3); m._lr_run(1, 1); } m._lr_pad(0); return hash(); };
  const a = anda(); r.restaurou = !!m._lr_state_load(ps, tam); const b = anda();
  r.deterministico = a === b;
  r.sramBytes = m._lr_mem_size(0); r.rtcBytes = m._lr_mem_size(1);
  const t0 = Date.now(); m._lr_run(600, 1); r.fps = Math.round(600000 / (Date.now() - t0));
  if (print) {   // imagem do último quadro, pra conferir no olho
    const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
    const w = m._lr_w(), h = m._lr_h(), px = Buffer.from(new Uint8Array(m.HEAPU8.buffer, m._lr_fb(), w * h * 4));
    if (PNG) { const png = new PNG({ width: w, height: h }); px.copy(png.data); fs.writeFileSync(print, PNG.sync.write(png)); }
    else fs.writeFileSync(print + '.rgba', px), r.print = `${print}.rgba (${w}x${h} RGBA, sem pngjs)`;
  }
  console.log(JSON.stringify(r));
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
