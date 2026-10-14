// Arquivo .spc: a "foto" do chip de som do SNES (formato padrão das trilhas).
// Leva o SPC700 (registradores), os 64 KB da RAM de som, os 128 registradores
// do DSP e uma etiqueta ID666 (nome da música, jogo, artista, duração).
// ler() põe um .spc dentro de um Apu do núcleo; gravar() faz o caminho de volta.
// Sem DOM: o teste roda no Node.
const KofSpc = (() => {
  'use strict';
  const ASSINATURA = 'SNES-SPC700 Sound File Data';
  const TAM = 0x10200;
  const texto = (u8, ini, n) => {
    let t = '';
    for (let i = ini; i < ini + n && u8[i]; i++) t += String.fromCharCode(u8[i]);
    return t.trim();
  };
  const escrever = (u8, ini, n, t) => {
    const s = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
    for (let i = 0; i < n; i++) u8[ini + i] = i < s.length ? s.charCodeAt(i) : 0;
  };
  function eSpc(u8) {
    return u8 && u8.length >= 0x10180 && texto(u8, 0, 27) === ASSINATURA;
  }
  // etiqueta ID666 (texto, o comum; ou binária, a antiga)
  function etiquetas(u8) {
    const t = { titulo: '', jogo: '', artista: '', segundos: 0, fadeMs: 0 };
    if (u8[0x23] !== 26) return t;
    t.titulo = texto(u8, 0x2E, 32); t.jogo = texto(u8, 0x4E, 32);
    const digitos = (i, n) => { for (let k = i; k < i + n; k++) { const c = u8[k]; if (c && (c < 48 || c > 57)) return false; } return true; };
    if (digitos(0xA9, 3) && digitos(0xAC, 5)) {
      t.segundos = +texto(u8, 0xA9, 3) || 0; t.fadeMs = +texto(u8, 0xAC, 5) || 0; t.artista = texto(u8, 0xB1, 32);
    } else {
      t.segundos = u8[0xA9] | (u8[0xAA] << 8) | (u8[0xAB] << 16);
      t.fadeMs = u8[0xAC] | (u8[0xAD] << 8) | (u8[0xAE] << 16) | (u8[0xAF] << 24);
      t.artista = texto(u8, 0xB0, 32);
    }
    if (t.segundos > 999) t.segundos = 0;
    return t;
  }
  function ler(apu, u8) {
    if (!eSpc(u8)) throw new Error('isso não parece um arquivo .spc');
    apu.reset();
    const ram = apu.ram;
    for (let i = 0; i < 0x10000; i++) ram[i] = u8[0x100 + i];
    for (let i = 0; i < 64; i++) ram[0xFFC0 + i] = u8[0x101C0 + i];   // a RAM que fica embaixo da ROM de boot
    // registradores de controle ($F0-$FF) viram o estado dos timers e das portas
    const f1 = ram[0xF1];
    for (let i = 0; i < 3; i++) {
      apu.tOn[i] = (f1 & (1 << i)) !== 0; apu.tTarget[i] = ram[0xFA + i];
      apu.tOut[i] = ram[0xFD + i] & 15; apu.tStage[i] = 0;
    }
    apu.iplEnabled = (f1 & 0x80) !== 0;
    apu.dspAddr = ram[0xF2];
    for (let i = 0; i < 4; i++) apu.inPorts[i] = ram[0xF4 + i];
    // DSP: os registradores entram direto; as vozes que estavam soando são religadas
    const d = apu.dsp;
    for (let i = 0; i < 128; i++) d.regs[i] = u8[0x10100 + i];
    d.konPending = 0;
    for (let v = 0; v < 8; v++) if (d.regs[v * 16 + 8] > 0) d.konPending |= 1 << v;
    d.regs[0x4C] = 0; d.outCount = 0;
    // SPC700
    const c = apu.spc;
    c.pc = u8[0x25] | (u8[0x26] << 8); c.a = u8[0x27]; c.x = u8[0x28]; c.y = u8[0x29];
    c.setPsw(u8[0x2A]); c.sp = u8[0x2B]; c.halted = false;
    return etiquetas(u8);
  }
  function gravar(apu, tag) {
    const u8 = new Uint8Array(TAM), ram = apu.ram, c = apu.spc, d = apu.dsp;
    escrever(u8, 0, 33, ASSINATURA + ' v0.30');
    u8[0x21] = 26; u8[0x22] = 26; u8[0x23] = 26; u8[0x24] = 30;
    u8[0x25] = c.pc & 0xFF; u8[0x26] = (c.pc >> 8) & 0xFF;
    u8[0x27] = c.a & 0xFF; u8[0x28] = c.x & 0xFF; u8[0x29] = c.y & 0xFF; u8[0x2A] = c.getPsw() & 0xFF; u8[0x2B] = c.sp & 0xFF;
    tag = tag || {};
    escrever(u8, 0x2E, 32, tag.titulo); escrever(u8, 0x4E, 32, tag.jogo); escrever(u8, 0x6E, 16, 'KOFnes');
    escrever(u8, 0x7E, 32, tag.comentario || 'capturado no KOFnes');
    const dt = new Date();
    escrever(u8, 0x9E, 11, `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`);
    escrever(u8, 0xA9, 3, String(Math.min(999, Math.round(tag.segundos || 180))));
    escrever(u8, 0xAC, 5, String(Math.min(99999, Math.round(tag.fadeMs || 8000))));
    escrever(u8, 0xB1, 32, tag.artista);
    for (let i = 0; i < 0x10000; i++) u8[0x100 + i] = ram[i] & 0xFF;
    let f1 = apu.iplEnabled ? 0x80 : 0;
    for (let i = 0; i < 3; i++) {
      if (apu.tOn[i]) f1 |= 1 << i;
      u8[0x100 + 0xFA + i] = apu.tTarget[i] & 0xFF; u8[0x100 + 0xFD + i] = apu.tOut[i] & 15;
    }
    u8[0x100 + 0xF1] = f1; u8[0x100 + 0xF2] = apu.dspAddr & 0xFF;
    for (let i = 0; i < 4; i++) u8[0x100 + 0xF4 + i] = apu.inPorts[i] & 0xFF;
    for (let i = 0; i < 128; i++) u8[0x10100 + i] = d.regs[i] & 0xFF;
    for (let i = 0; i < 64; i++) u8[0x101C0 + i] = ram[0xFFC0 + i] & 0xFF;
    return u8;
  }
  return { ler, gravar, etiquetas, eSpc };
})();
if (typeof module !== 'undefined') module.exports = KofSpc;
