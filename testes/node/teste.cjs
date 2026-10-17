const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const Estado = require(process.env.ESTADO || require('path').join(__dirname, '..', '..', 'web', 'estado.js'));
const rom = Int32Array.from(fs.readFileSync(process.argv[3]));
const botao = (f) => (f % 50 < 4) ? 0x1000 : (f % 50 < 8) ? 0x0080 : (f % 37 < 3) ? 0x0100 : 0;
function roda(s, ini, n) {
  let som = 0;
  for (let f = ini; f < ini + n; f++) {
    s.pad[0] = botao(f); s.runFrame();
    const d = s.apu.dsp; for (let i = 0; i < d.outCount; i++) som = (Math.imul(som, 31) + (d.outBuf[i] & 0xFFFF)) & 0x7FFFFFFF; d.outCount = 0;
  }
  let tela = 0; for (let p = 0; p < 57344; p++) tela = (Math.imul(tela, 31) + (s.ppu.frame[p] & 0xFFFFFF)) & 0x7FFFFFFF;
  return `tela=${tela} som=${som} pc=${s.cpu.pc} spc=${s.apu.spc.pc}`;
}
const s = new ctx.KofNucleo.Snes(rom); s.reset();
roda(s, 0, 300);
let t = performance.now();
const texto = JSON.stringify(Estado.capturar(s));
const tCap = performance.now() - t;
const A = roda(s, 300, 120);
t = performance.now(); Estado.restaurar(s, JSON.parse(texto)); const tRes = performance.now() - t;
const B = roda(s, 300, 120);
const s2 = new ctx.KofNucleo.Snes(rom); s2.reset(); Estado.restaurar(s2, JSON.parse(texto));
const C = roda(s2, 300, 120);
console.log(process.argv[3].split('/').pop(), `estado=${(texto.length / 1024).toFixed(0)} KB (capturar ${tCap.toFixed(0)} ms, restaurar ${tRes.toFixed(0)} ms)`);
console.log(' A (seguiu)       ', A); console.log(' B (voltou)       ', B); console.log(' C (console novo) ', C);
console.log(A === B && A === C ? ' IDÊNTICO' : ' DIFERENTE');
