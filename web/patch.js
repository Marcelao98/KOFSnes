// Patches de tradução (e hacks): IPS, BPS e UPS aplicados na memória. A ROM original nunca muda: o jogo traduzido vira
// outro jogo na biblioteca (outra ROM, outro save). BPS e UPS trazem o CRC32 da ROM certa: com a ROM errada, avisa.
// Cópia de SNES com cabeçalho de 512 bytes: se o CRC não bate, tenta sem o cabeçalho (e o IPS, com e sem, pelo tamanho).
const KofPatch = (() => {
  'use strict';
  const EXT = /\.(ips|bps|ups)$/i;
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc32 = (u8, ini = 0, fim = u8.length) => { let c = 0xFFFFFFFF; for (let i = ini; i < fim; i++) c = T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const txt = (u8, i, n) => String.fromCharCode(...u8.subarray(i, i + n));
  const tipo = (p) => txt(p, 0, 5) === 'PATCH' ? 'ips' : txt(p, 0, 4) === 'BPS1' ? 'bps' : txt(p, 0, 4) === 'UPS1' ? 'ups' : null;
  const erroRom = () => new Error('esse patch é pra outra versão do jogo (a ROM não bate com a que ele espera)');

  function ips(rom, p) {
    let i = 5, tam = rom.length, out = new Uint8Array(Math.max(rom.length, 16 << 20)), fimMax = rom.length;
    out.set(rom);
    while (i + 3 <= p.length) {
      if (txt(p, i, 3) === 'EOF') { i += 3; if (i + 3 <= p.length) tam = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]; else tam = fimMax; return out.slice(0, tam); }
      const ofs = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2], n = (p[i + 3] << 8) | p[i + 4];
      i += 5;
      if (n) { out.set(p.subarray(i, i + n), ofs); i += n; fimMax = Math.max(fimMax, ofs + n); }
      else { const r = (p[i] << 8) | p[i + 1], v = p[i + 2]; out.fill(v, ofs, ofs + r); i += 3; fimMax = Math.max(fimMax, ofs + r); }
    }
    throw new Error('patch IPS incompleto');
  }
  // número de tamanho variável do BPS/UPS
  function leitor(p, i) {
    return {
      i,
      num() { let d = 0, s = 1; for (;;) { const x = p[this.i++]; d += (x & 0x7F) * s; if (x & 0x80) break; s *= 128; d += s; } return d; },
    };
  }
  function bps(rom, p) {
    const fim = p.length - 12, l = leitor(p, 4);
    const tamOrig = l.num(), tamNovo = l.num(), meta = l.num(); l.i += meta;
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    if (crc32(p, 0, p.length - 4) !== dv.getUint32(p.length - 4, true)) throw new Error('patch BPS corrompido');
    const crcOrig = dv.getUint32(fim, true), crcNovo = dv.getUint32(fim + 4, true);
    if (rom.length !== tamOrig || crc32(rom) !== crcOrig) throw erroRom();
    const out = new Uint8Array(tamNovo);
    let o = 0, fonte = 0, alvo = 0;
    while (l.i < fim) {
      const d = l.num(), acao = d & 3, n = Math.floor(d / 4) + 1;
      if (acao === 0) { out.set(rom.subarray(o, o + n), o); o += n; }
      else if (acao === 1) { out.set(p.subarray(l.i, l.i + n), o); l.i += n; o += n; }
      else {
        const x = l.num(), desl = (x & 1 ? -1 : 1) * Math.floor(x / 2);
        if (acao === 2) { fonte += desl; out.set(rom.subarray(fonte, fonte + n), o); fonte += n; o += n; }
        else { alvo += desl; for (let k = 0; k < n; k++) out[o++] = out[alvo++]; }
      }
    }
    if (crc32(out) !== crcNovo) throw new Error('o patch não deu certo nessa ROM (o resultado não confere)');
    return out;
  }
  function ups(rom, p) {
    const fim = p.length - 12, l = leitor(p, 4), dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const tamA = l.num(), tamB = l.num(), crcA = dv.getUint32(fim, true), crcB = dv.getUint32(fim + 4, true);
    const crc = crc32(rom), ida = rom.length === tamA && crc === crcA, volta = rom.length === tamB && crc === crcB;
    if (!ida && !volta) throw erroRom();
    const out = new Uint8Array(ida ? tamB : tamA);
    out.set(rom.subarray(0, Math.min(rom.length, out.length)));
    let o = 0;
    while (l.i < fim) {
      o += l.num();
      while (l.i < fim) { const x = p[l.i++]; if (o < out.length) out[o] = (o < rom.length ? rom[o] : 0) ^ x; o++; if (!x) break; }
    }
    if (crc32(out) !== (ida ? crcB : crcA)) throw new Error('o patch não deu certo nessa ROM (o resultado não confere)');
    return out;
  }
  // devolve a ROM nova; "cabecalho": ROM de SNES com os 512 bytes de cópia na frente
  function aplicar(rom, patch, sistema) {
    const t = tipo(patch);
    if (!t) throw new Error('não reconheci esse patch (aceito .ips, .bps e .ups)');
    const temCab = sistema === 'snes' && rom.length % 1024 === 512;
    const semCab = temCab ? rom.subarray(512) : rom;
    if (t === 'ips') return { tipo: t, rom: ips(temCab ? semCab : rom, patch) };   // os patches de hoje são pra ROM sem cabeçalho
    const f = t === 'bps' ? bps : ups;
    try { return { tipo: t, rom: f(rom, patch) }; } catch (e) {
      if (temCab && e.message === erroRom().message) return { tipo: t, rom: f(semCab, patch) };
      throw e;
    }
  }
  return { aplicar, tipo, crc32, EXT };
})();
if (typeof module !== 'undefined') module.exports = KofPatch;
