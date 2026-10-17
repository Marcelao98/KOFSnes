const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const E = require(require('path').join(__dirname, '..', '..', 'web', 'estado.js')), S = require(require('path').join(__dirname, '..', '..', 'web', 'spc.js'));
const s = new ctx.KofNucleo.Snes(Int32Array.from(fs.readFileSync(process.argv[3]))); s.reset();
for (let i = 0; i < 300; i++) { s.runFrame(); s.apu.dsp.outCount = 0; }
const energia = (apu, seg) => { let e = 0, n = 0; for (let k = 0; k < seg * 250; k++) { apu.run(4096); const d = apu.dsp; for (let i = 0; i < d.outCount; i++) { e += Math.abs(d.outBuf[i]); n++; } d.outCount = 0; } return Math.round(e / Math.max(1, n)); };
// energia no próprio jogo (referência)
let ej = 0, nj = 0; const s2 = s; 
const foto = JSON.stringify(E.capturar(s.apu));
for (let i = 0; i < 120; i++) { s.runFrame(); const d = s.apu.dsp; for (let k = 0; k < d.outCount; k++) { ej += Math.abs(d.outBuf[k]); nj++; } d.outCount = 0; }
console.log('energia no jogo:', Math.round(ej / nj), '| fotoKB', Math.round(foto.length / 1024));
const a = new ctx.KofNucleo.Apu(); a.reset(); E.restaurar(a, JSON.parse(foto));
console.log('chip avulso (captura exata), 2 s:', energia(a, 2));
const a2 = new ctx.KofNucleo.Apu(); a2.reset(); E.restaurar(a2, JSON.parse(foto));
const spc = S.gravar(a2, { titulo: 'Tema de teste', jogo: 'Monster Farm Jump', artista: 'Tecmo', segundos: 95 });
fs.writeFileSync(require('path').join(require('os').tmpdir(), 'teste.spc'), spc);
const b = new ctx.KofNucleo.Apu(); const tag = S.ler(b, spc);
console.log('etiqueta lida de volta:', tag, '| tamanho .spc', spc.length);
console.log('tocando o .spc, 2 s:', energia(b, 2));
b.dsp.mudas = 0xFF; console.log('com as 8 vozes mudas:', energia(b, 1));
