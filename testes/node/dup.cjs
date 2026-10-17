const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const s = new ctx.KofNucleo.Snes(Int32Array.from(fs.readFileSync(process.argv[3]))); s.reset();
for (let i = 0; i < 300; i++) { s.runFrame(); s.apu.dsp.outCount = 0; }
const onde = new Map(), vis = new Set();
(function anda(o, cam) {
  if (vis.has(o)) return; vis.add(o);
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object') {
      if (ArrayBuffer.isView(v) || Array.isArray(v)) { if (!onde.has(v)) onde.set(v, []); onde.get(v).push(cam + '.' + k); if (Array.isArray(v)) v.forEach((x, i) => { if (x && typeof x === 'object' && !Array.isArray(x)) anda(x, cam + '.' + k + '[' + i + ']'); }); }
      else anda(v, cam + '.' + k);
    }
  }
})(s, 'snes');
for (const [v, l] of onde) if (l.length > 1) console.log(v.constructor.name, v.length, l.join('  '));
