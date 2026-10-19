// Mede, no Node (V8), quantos quadros por segundo o Snes9x (WASM) e o núcleo Kof (JS) fazem sem esperar o relógio,
// com a mesma ROM. 60,1 fps = velocidade de um SNES de verdade (1,0×).
//   node testes/nucleo-snes9x/medir.cjs dist/web/KOFnes.html snes9x.js rom.sfc [quadros]
const fs = require('fs'), vm = require('vm');
const [,, htmlP, jsP, romP, nArg] = process.argv, N = +(nArg || 600);
const rom = fs.readFileSync(romP);
(async () => {
  // Snes9x (WASM)
  const M = await require(require('path').resolve(jsP))();
  M._s9x_init();
  const p = M._s9x_alloc(rom.length); M.HEAPU8.set(rom, p);
  const ok = M._s9x_load(p, rom.length);
  M._s9x_run(120, 1);
  const medeS = (copia) => { const t0 = performance.now(); M._s9x_run(N, copia); return N * 1000 / (performance.now() - t0); };
  const s1 = Math.max(medeS(0), medeS(0)), s2 = Math.max(medeS(1), medeS(1));
  console.log(`Snes9x (WASM): carregou=${ok} ${M._s9x_w()}x${M._s9x_h()}  só emulação ${s1.toFixed(0)} fps (${(s1 / 60.0988).toFixed(2)}×) · com imagem ${s2.toFixed(0)} fps (${(s2 / 60.0988).toFixed(2)}×)`);
  // Kof (JS)
  const html = fs.readFileSync(htmlP, 'utf8');
  const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
  const ctx = { console, Math, performance }; vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
  const s = new ctx.KofNucleo.Snes(Int32Array.from(rom)); s.reset();
  const px = new Uint32Array(57344);
  const medeK = (desenha) => { const t0 = performance.now(); for (let i = 0; i < N; i++) { s.pad[0] = 0; s.runFrame(); s.apu.dsp.outCount = 0; if (desenha) { const f = s.ppu.frame; for (let q = 0; q < 57344; q++) { const c = f[q]; px[q] = 0xFF000000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF); } } } return N * 1000 / (performance.now() - t0); };
  for (let i = 0; i < 120; i++) { s.runFrame(); s.apu.dsp.outCount = 0; }
  const k1 = Math.max(medeK(false), medeK(false)), k2 = Math.max(medeK(true), medeK(true));
  console.log(`Kof (JS)     : só emulação ${k1.toFixed(0)} fps (${(k1 / 60.0988).toFixed(2)}×) · com imagem ${k2.toFixed(0)} fps (${(k2 / 60.0988).toFixed(2)}×)`);
  console.log(`=> Snes9x é ${(s2 / k2).toFixed(1)}× mais rápido que o Kof (com imagem)`);
})();
