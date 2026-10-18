// Etapa 0 do núcleo em Rust: a CPU em Rust/WASM tem que dar EXATAMENTE o mesmo que a CPU do Kof,
// e a gente mede quanto ela é mais rápida. Mesmo barramento de teste dos dois lados.
//   node testes/nucleo-rust/comparar.cjs dist/web/KOFnes.html nucleo-rs/target/wasm32-unknown-unknown/release/nucleo_rs.wasm rom.sfc [instruções]
const fs = require('fs'), vm = require('vm');
const [,, htmlP, wasmP, romP, nArg] = process.argv, N = +(nArg || 3000000), K = 5000;
const html = fs.readFileSync(htmlP, 'utf8'), rom = fs.readFileSync(romP);
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
// a classe Cpu não é exportada do módulo, mas dá pra pegar de um Snes
const Cpu = new ctx.KofNucleo.Snes(Int32Array.from(rom)).cpu.constructor;

// ---- lado Kof: o barramento de teste em JavaScript (igual ao BusTeste do Rust) ----
class BusJs {
  constructor() { this.wram = new Uint8Array(0x20000); this.ciclos = 0; }
  read(addr) {
    this.ciclos += 8;
    const bank = (addr >> 16) & 0xFF, off = addr & 0xFFFF, b7 = bank & 0x7F;
    if (b7 < 0x7E && off >= 0x8000) return rom[(b7 * 0x8000 + (off - 0x8000)) % rom.length];
    if (bank === 0x7E || bank === 0x7F) return this.wram[(bank - 0x7E) * 0x10000 + off];
    if (b7 < 0x40) {
      if (off < 0x2000) return this.wram[off];
      if (off === 0x4210 || off === 0x4212) return (Math.floor(this.ciclos / 40000) & 1) << 7;
    }
    return 0;
  }
  write(addr, v) {
    this.ciclos += 8;
    const bank = (addr >> 16) & 0xFF, off = addr & 0xFFFF;
    if (bank === 0x7E || bank === 0x7F) this.wram[(bank - 0x7E) * 0x10000 + off] = v & 0xFF;
    else if ((bank & 0x7F) < 0x40 && off < 0x2000) this.wram[off] = v & 0xFF;
  }
  idle() { this.ciclos += 6; }
}
function novoKof() { const bus = new BusJs(), cpu = new Cpu(bus); cpu.reset(); return { cpu, bus, run(n) { for (let i = 0; i < n; i++) cpu.step(); } }; }

// ---- lado Rust/WASM ----
const wasm = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(wasmP)), {}).exports;
function novoRust() {
  const p = wasm.kof_alloc(rom.length); new Uint8Array(wasm.memory.buffer, p, rom.length).set(rom);
  wasm.spike_load(p, rom.length);
  return { run: (n) => wasm.spike_run(n) };
}

const nomes = ['a', 'x', 'y', 's', 'd', 'dbr', 'pbr', 'pc', 'P', 'e', 'waiting', 'stopped'];
const regsKof = (k) => { const c = k.cpu; return [c.a, c.x, c.y, c.s, c.d, c.dbr, c.pbr, c.pc, c.getP(), +c.e, +c.waiting, +c.stopped]; };
const regsRust = () => nomes.map((_, i) => wasm.spike_reg(i));
const hash = (u8) => { let h = 2166136261; for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619); return h >>> 0; };
const wramRust = () => new Uint8Array(wasm.memory.buffer, wasm.spike_wram_ptr(), 0x20000);
const igual = (k) => regsKof(k).join() === regsRust().join() && hash(k.bus.wram) === hash(wramRust()) && k.bus.ciclos === wasm.spike_ciclos();

// 1) igualdade: de K em K instruções; se divergir, acha a primeira instrução diferente
let k = novoKof(), r = novoRust(), feitos = 0, diverge = -1;
while (feitos < N) { k.run(K); r.run(K); feitos += K; if (!igual(k)) { diverge = feitos; break; } }
if (diverge < 0) console.log(`IGUAL: ${N.toLocaleString('pt-BR')} instruções, registradores + WRAM + ciclos idênticos (conferido a cada ${K})`);
else {
  const k2 = novoKof(), r2 = novoRust(); let n = 0;
  for (; n < diverge; n++) { k2.run(1); r2.run(1); if (!igual(k2)) break; }
  console.log(`DIVERGIU na instrução ${n + 1} (opcode anterior $${k2.cpu.lastOp.toString(16)})\n  Kof : ${nomes.map((x, i) => x + '=' + regsKof(k2)[i].toString(16)).join(' ')}\n  Rust: ${nomes.map((x, i) => x + '=' + regsRust()[i].toString(16)).join(' ')}`);
  process.exit(1);
}

// 2) velocidade: melhor de 3 execuções de N instruções (mesmo V8, mesma máquina)
const tempo = (cria) => { let melhor = 1e9; for (let i = 0; i < 3; i++) { const x = cria(); const t0 = performance.now(); x.run(N); melhor = Math.min(melhor, performance.now() - t0); } return melhor; };
const tk = tempo(novoKof), tr = tempo(novoRust);
console.log(`velocidade (${N.toLocaleString('pt-BR')} instruções):`);
console.log(`  Kof  (JavaScript): ${tk.toFixed(0)} ms  = ${(N / tk / 1000).toFixed(1)} M instruções/s`);
console.log(`  Rust (WebAssembly): ${tr.toFixed(0)} ms  = ${(N / tr / 1000).toFixed(1)} M instruções/s`);
console.log(`  => Rust é ${(tk / tr).toFixed(1)}× mais rápido`);
