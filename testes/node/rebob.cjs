const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const E = require(require('path').join(__dirname, '..', '..', 'web', 'estado.js'));
const s = new ctx.KofNucleo.Snes(Int32Array.from(fs.readFileSync(process.argv[3]))); s.reset();
const ass = () => { let t = 0; const f = s.ppu.frame; for (let p = 0; p < 57344; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF; return t + ':' + s.cpu.pc; };
const pad = (n) => (n % 240 < 20 ? 0x1000 : n % 7 < 3 ? 0x0100 | 0x8000 : 0x0100);   // Start de vez em quando, anda e pula
const r = E.Rebobinador(s, 64 << 20);
const orig = []; let tg = 0, n = 0;
for (; n < 1200; n++) {
  s.pad[0] = pad(n); s.runFrame(); s.apu.dsp.outCount = 0;
  if (n % 2 === 1) { const t0 = performance.now(); r.gravar(); tg += performance.now() - t0; }
  orig[n] = ass();
}
console.log('fotos', r.fotos, 'MB', (r.bytes / 1048576).toFixed(1), 'KB/foto', (r.bytes / r.fotos / 1024).toFixed(1), 'ms/gravar', (tg / 600).toFixed(3));
// volta 150 fotos (≈5 s): a cabeça fica no estado logo após o quadro 1199-2*150 = 899... confere
let tv = 0; for (let i = 0; i < 150; i++) { const t0 = performance.now(); r.voltar(); tv += performance.now() - t0; }
console.log('ms/voltar', (tv / 150).toFixed(3), 'fotos restantes', r.fotos);
// a última foto restante foi gravada após o quadro q; o console agora está nele
const q = 2 * r.fotos + 1;   // a última foto que sobrou foi gravada no quadro q; voltar deixa a cabeça no estado após q
let ok = 0, mal = 0;
for (let m = q + 1; m < 1200; m++) { s.pad[0] = pad(m); s.runFrame(); s.apu.dsp.outCount = 0; if (ass() === orig[m]) ok++; else mal++; }
console.log('depois de voltar, quadros iguais ao original:', ok, 'diferentes:', mal, '(a partir do quadro', q + 1 + ')');
