const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
let rom = fs.readFileSync(process.argv[3]);
const s = new ctx.KofNucleo.Snes(Int32Array.from(rom)); s.reset(); for (let i = 0; i < 60; i++) s.runFrame();
const PULAR = new Set(['rom', 'frame', 'outBuf']); const vistos = new Set(); let arrs = [], prims = 0, refs = 0, tipos = {};
(function anda(o) {
  if (vistos.has(o)) return; vistos.add(o);
  for (const k of Object.keys(o)) {
    if (PULAR.has(k)) continue; const v = o[k];
    if (v === null || typeof v !== 'object') { if (typeof v !== 'function') { prims++; tipos[typeof v] = (tipos[typeof v] || 0) + 1; } continue; }
    refs++;
    if (ArrayBuffer.isView(v)) { if (!vistos.has(v)) { vistos.add(v); arrs.push(v); } continue; }
    anda(v);
  }
})(s);
const bytes = arrs.reduce((t, a) => t + a.byteLength, 0);
console.log({ arrays: arrs.length, kb: Math.round(bytes / 1024), prims, refs, tipos, maiores: arrs.map((a) => a.constructor.name + a.length).sort().slice(0, 40).join(' ') });
