const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const E = require(require('path').join(__dirname, '..', '..', 'web', 'estado.js'));
const s = new ctx.KofNucleo.Snes(Int32Array.from(fs.readFileSync(process.argv[3]))); s.reset();
for (let i = 0; i < 300; i++) { s.runFrame(); s.apu.dsp.outCount = 0; }
const f1 = E.capturar(s);
for (let i = 0; i < 50; i++) { s.runFrame(); s.apu.dsp.outCount = 0; }
E.restaurar(s, JSON.parse(JSON.stringify(f1)));
const f2 = E.capturar(s);
(function cmp(a, b, cam) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && a.f && b.f) { for (const k of new Set([...Object.keys(a.f), ...Object.keys(b.f)])) cmp(a.f[k], b.f[k], cam + '.' + k); return; }
  console.log('DIFERENTE', cam, JSON.stringify(a).slice(0, 80), '|', JSON.stringify(b).slice(0, 80));
})(f1.raiz, f2.raiz, 'snes');
