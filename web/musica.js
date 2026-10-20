// Música própria do KOFstation em 8 bits: um chip simples no estilo do NES (2 pulsos, triângulo e ruído) tocando duas
// músicas de domínio público com arranjo nosso, sem gravação de ninguém:
//   air: Air ("on the G string"), J. S. Bach, BWV 1068 — notas da partitura de domínio público do Mutopia Project
//        (web/musicas/air-bach-mutopia.ly -> LilyPond -> MIDI -> web/musicas/air-midi.py -> air.json; o juntar.py põe aqui)
//   rua: "Se Essa Rua Fosse Minha", cantiga popular tradicional — melodia de uma partitura de domínio público (abaixo)
// O tocador tem a mesma cara dos tocadores da jukebox (encher/limpar/mudas/onda), então toca pelo mesmo caminho de áudio
// e aparece no modo Ondas com os 4 canais.
const KofMusica = (() => {
  'use strict';
  const TAXA = 32000;
  const AIR = /*{{AIR}}*/ null;
  // "Se Essa Rua Fosse Minha" (lá menor, 2/4): melodia da partitura de domínio público que o Marcelo mandou (arranjo de
  // Daniel Pynkus no MuseScore, marcado "Domínio público"): nota+oitava:duração em tempos ("-" = pausa). Começa com a
  // anacruse "Se es-sa" (1 tempo); cada compasso (2 tempos) tem um acorde: o triângulo faz o baixo (fundamental e quinta,
  // como a mão esquerda da partitura) e o pulso 2 o arpejo de caixinha de música
  const RUA = {
    bpm: 66, anacruse: 1,
    melodia: 'E5:.5 E5:.5 '
      + 'A5:.5 A5:.5 E5:.5 C5:.5 A4:.5 C5:.5 G5:.5 F5:.5 E5:1 B4:2 E5:.5 E5:.5 '
      + 'B5:.5 B5:.5 F5:.5 E5:.5 F5:.5 E5:.5 C6:.5 B5:.5 A5:3 E5:.5 E5:.5 '
      + 'A5:.5 A5:.5 C6:.5 B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 G5:1 F5:2 E5:.5 D5:.5 '
      + 'E5:1 B5:.5 G#5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:2',
    acordes: 'Am Am E E E E Am Am Am Am Dm Dm E E Am',   // um por compasso, depois da anacruse
  };
  const ACORDE = { Am: [45, 52, 57, 60, 64], E: [40, 47, 56, 59, 64], Dm: [38, 45, 57, 62, 65] };   // [baixo, quinta, notas do arpejo]
  const NOTA = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (t) => { const m = /^([A-G])(b|#)?(-?\d)$/.exec(t); return m ? 12 * (+m[3] + 1) + NOTA[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) : null; };
  function lerRua() {
    const mel = [], baixo = [], arpejo = [];
    let t = 0;
    for (const p of RUA.melodia.trim().split(/\s+/)) {
      const [n, d] = p.split(':'), dur = +d;
      if (n !== '-') mel.push([t, dur, midi(n)]);
      t += dur;
    }
    RUA.acordes.split(/\s+/).forEach((a, k) => {
      const ac = ACORDE[a], ini = RUA.anacruse + k * 2;
      baixo.push([ini, 0.9, ac[0]], [ini + 1, 0.9, ac[1]]);
      for (let i = 0; i < 4; i++) arpejo.push([ini + i * 0.5, 0.45, ac[2 + (i % 3)] + 12]);
    });
    return { bpm: RUA.bpm, tempos: Math.ceil(t), vozes: [mel, arpejo, baixo] };   // o fim emenda na anacruse do começo
  }
  const MUSICAS = {
    air: { titulo: 'Air (na corda Sol)', autor: 'J. S. Bach', dados: () => AIR },
    rua: { titulo: 'Se Essa Rua Fosse Minha', autor: 'cantiga popular', dados: lerRua },
  };
  const NOMES = ['Pulso 1', 'Pulso 2', 'Triângulo', 'Ruído'], PAPEIS = ['melodia', 'harmonia', 'baixo', '—'];
  // timbre de cada canal: [forma, volume, pan (-1 esquerda .. 1 direita), vibrato]
  const VOZ = [['p25', 0.17, 0, 1], ['p12', 0.07, -0.35, 0], ['tri', 0.26, 0.1, 0], ['ruido', 0, 0, 0]];
  function tocador(qual) {
    const M = MUSICAS[qual] || MUSICAS.air, d = M.dados();
    if (!d) throw new Error('música não encontrada');
    const seg = 60 / d.bpm, total = d.tempos * seg;
    // cada voz vira uma lista de notas em segundos, já ordenada
    const vozes = d.vozes.slice(0, 3).map((v) => v.map(([ini, dur, n]) => ({ ini: ini * seg, fim: (ini + dur) * seg * 0.97, f: 440 * Math.pow(2, (n - 69) / 12) })).sort((a, b) => a.ini - b.ini));
    const fase = [0, 0, 0, 0], idx = [0, 0, 0], onda = new Int16Array(4 * 4096), saida = new Int16Array(1024 * 2);
    let t = 0, pos = 0, mudas = 0, ruido = 1;
    const BLOCO = 512;
    function amostraVoz(v, nota, tt) {
      if (!nota) return 0;
      const dt = tt - nota.ini, falta = nota.fim - tt;
      let env = Math.min(1, dt / 0.008) * (falta < 0.04 ? Math.max(0, falta / 0.04) : 1);
      if (VOZ[v][0] !== 'tri') env *= 0.75 + 0.25 * Math.exp(-dt * 3);   // ataque um pouco mais forte, depois assenta
      let f = nota.f;
      if (VOZ[v][3] && dt > 0.25) f *= 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * dt) * Math.min(1, (dt - 0.25) * 2);   // vibrato
      fase[v] = (fase[v] + f / TAXA) % 1;
      const p = fase[v], forma = VOZ[v][0];
      let s;
      if (forma === 'p25') s = p < 0.25 ? 1 : -1;
      else if (forma === 'p12') s = p < 0.125 ? 1 : -1;
      else s = (Math.floor(p * 32) < 16 ? Math.floor(p * 32) : 31 - Math.floor(p * 32)) / 7.5 - 1;   // triângulo de 16 degraus, como o do NES
      return s * env;
    }
    function notaAtual(v, tt) {
      const l = vozes[v];
      while (idx[v] < l.length && l[idx[v]].fim < tt) idx[v]++;
      const n = l[idx[v]];
      return n && n.ini <= tt && tt < n.fim ? n : null;
    }
    return {
      sis: 'kof8', canais: 4, nomes: NOMES, papeis: PAPEIS, taxa: TAXA, titulo: M.titulo, autor: M.autor,
      encher() {
        for (let i = 0; i < BLOCO; i++) {
          let l = 0, r = 0;
          for (let v = 0; v < 3; v++) {
            const s = amostraVoz(v, notaAtual(v, t), t) * VOZ[v][1];
            onda[v * 4096 + (pos & 4095)] = s * 32767;
            if (mudas & (1 << v)) continue;
            l += s * (1 - Math.max(0, VOZ[v][2])); r += s * (1 + Math.min(0, VOZ[v][2]));
          }
          ruido = (ruido >> 1) | (((ruido ^ (ruido >> 1)) & 1) << 14);   // o canal de ruído fica parado (sem bateria nessas músicas)
          onda[3 * 4096 + (pos & 4095)] = 0;
          saida[i * 2] = Math.max(-1, Math.min(1, l)) * 32767; saida[i * 2 + 1] = Math.max(-1, Math.min(1, r)) * 32767;
          pos++; t += 1 / TAXA;
          if (t >= total) { t = 0; idx.fill(0); }   // acabou: volta pro começo (loop)
        }
        return { b: saida, n: BLOCO * 2 };
      },
      limpar() {},
      mudas(m) { mudas = m; },
      onda(v) { return { buf: onda, base: v * 4096, tam: 4096, pos: pos & 4095, escala: 1 / 9000, taxa: TAXA }; },
      nivel: null,
      fechar() {},
      segundos: total,
    };
  }
  return { tocador, MUSICAS };
})();
if (typeof module !== 'undefined') module.exports = KofMusica;
