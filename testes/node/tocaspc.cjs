const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const S = require(require('path').join(__dirname, '..', '..', 'web', 'spc.js'));
const a = new ctx.KofNucleo.Apu(); const t = S.ler(a, fs.readFileSync(process.argv[3]));
let e = 0, n = 0; for (let k = 0; k < 500; k++) { a.run(4096); for (let i = 0; i < a.dsp.outCount; i++) { e += Math.abs(a.dsp.outBuf[i]); n++; } a.dsp.outCount = 0; }
console.log(t, 'energia em 2 s:', Math.round(e / n));
