// Testa o adaptador do Snes9x no Node: roda uma ROM, confere imagem, áudio, savestate (volta igual) e rebobinar.
//   node testes/android/nucleo-s9x.cjs rom.sfc
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..', '..');
const ctx = { console, setTimeout, atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'), module: { exports: {} } };
vm.createContext(ctx);
const carregar = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
carregar(path.join(raiz, 'nucleo-libretro/saida/snes9x.js'));
carregar(path.join(raiz, 'web/estado.js')); carregar(path.join(raiz, 'web/spc.js'));
vm.runInContext('globalThis.KofEstado = KofEstado;', ctx);
carregar(path.join(raiz, 'web/nucleo_s9x.js'));
vm.runInContext('globalThis.KofS9x = KofS9x; globalThis.Nucleo_snes9x = typeof Nucleo_snes9x !== "undefined" ? Nucleo_snes9x : undefined;', ctx);
(async () => {
  const rom = new Uint8Array(fs.readFileSync(process.argv[2])), r = {};
  const s = await ctx.KofS9x.criar(rom);
  r.titulo = s.cart.title.trim();
  for (let i = 0; i < 180; i++) { s.pad[0] = 0; s.runFrame(); if (i < 179) s.apu.dsp.outCount = 0; }
  const f = s.ppu.frame; let cores = new Set(); for (let i = 0; i < f.length; i += 37) cores.add(f[i]);
  r.coresNaImagem = cores.size; r.imagemNaoPreta = cores.size > 1;
  r.audioValores = s.apu.dsp.outCount; r.audioNaoMudo = s.apu.dsp.outBuf.slice(0, s.apu.dsp.outCount).some((v) => v !== 0);
  r.bytesEstado = s.tamEstado;
  // savestate: guarda, anda 120 quadros, restaura, anda os mesmos 120: tem que dar a mesma imagem
  const E = ctx.KofEstado, est = E.capturar(s);
  const hash = (fr) => { let t = 0; for (let p = 0; p < fr.length; p++) t = (Math.imul(t, 31) + (fr[p] & 0xFFFFFF)) | 0; return t; };
  const anda = (n) => { for (let i = 0; i < n; i++) { s.pad[0] = i % 7 ? 0x0100 : 0x0080; s.runFrame(); s.apu.dsp.outCount = 0; } return hash(s.ppu.frame); };
  const a = anda(120); E.restaurar(s, est); const b = anda(120);
  r.estadoDeterministico = a === b;
  // rebobinar: grava 60 fotos andando, volta 30 e compara com o estado guardado naquele ponto
  const rb = E.Rebobinador(s, 48 << 20, 150); let guardado = null;
  for (let i = 1; i <= 60; i++) { s.pad[0] = 0x0100; s.runFrame(); s.apu.dsp.outCount = 0; rb.gravar(); if (i === 30) guardado = s.serializar(); }
  r.fotos = rb.fotos; r.bytesRebob = rb.bytes;
  for (let i = 0; i < 30; i++) rb.voltar();
  const agora = s.serializar();
  r.rebobinou = rb.fotos === 29 && agora.length === guardado.length && agora.every((v, i) => v === guardado[i]);   // voltou exatamente ao estado do quadro 30
  // música: o estado do chip de som vira um .spc válido (a Jukebox toca esse formato)
  const KS = vm.runInContext('KofSpc', ctx), spc = s.gravarSpc({ titulo: 'teste', jogo: 'jogo' });
  r.spcValido = KS.eSpc(spc) && spc.length === 0x10200; r.spcPC = spc[0x25] | (spc[0x26] << 8); r.spcDspVolEsq = spc[0x10100 + 0x0C];
  // reprodução de bug: estado guardado + mesmas entradas, numa instância NOVA (como o bugs/reproduzir.cjs), dá a mesma imagem
  const marco = E.capturar(s), entradas = Array.from({ length: 90 }, (_, i) => (i % 5 ? 0x0100 : 0x0080));
  for (const b of entradas) { s.pad[0] = b; s.runFrame(); s.apu.dsp.outCount = 0; }
  const h1 = hash(s.ppu.frame);
  const s2 = await ctx.KofS9x.criar(rom); E.restaurar(s2, marco);
  for (const b of entradas) { s2.pad[0] = b; s2.runFrame(); s2.apu.dsp.outCount = 0; }
  r.replayEmInstanciaNova = hash(s2.ppu.frame) === h1;
  // SRAM
  r.sramBytes = s.cart.hasSram() ? s.cart.sram.length : 0;
  const t0 = Date.now(); for (let i = 0; i < 300; i++) { s2.runFrame(); s2.apu.dsp.outCount = 0; } r.fps = Math.round(300000 / (Date.now() - t0));
  console.log(JSON.stringify(r));
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
