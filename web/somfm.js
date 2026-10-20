// Tocador da trilha do KOFstation no núcleo SÓ DE SOM (nucleo-libretro/somfm.c: YM2612 + PSG do Genesis Plus GX, ~80 KB,
// embutido no html pelo juntar.py). Recebe a lista de comandos da trilha (web/musicas/trilha.js) e devolve um tocador
// com a mesma cara dos da jukebox (encher/limpar/mudas/onda), com os 10 canais (6 FM + 4 PSG) no modo Ondas.
const KofSomFm = (() => {
  'use strict';
  const TAXA = 48000, TAM = 4096;
  const CANAIS = ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'PSG 1', 'PSG 2', 'PSG 3', 'Ruído'];
  const PAPEIS = ['FM', 'FM', 'FM', 'FM', 'FM', 'FM', 'quadrada', 'quadrada', 'quadrada', 'LFSR'];
  let modulo = null, cmdPtr = 0, cmdTam = 0;
  const disponivel = () => typeof Nucleo_somfm !== 'undefined';
  async function tocador(cmd) {
    if (!disponivel()) throw new Error('sem o núcleo de som');
    if (!modulo) modulo = Nucleo_somfm().then((m) => { m._som_iniciar(TAXA); return m; });
    const m = await modulo;
    // uma música por vez (a jukebox e o Início nunca tocam duas): reaproveita a memória dos comandos
    if (cmd.length > cmdTam) { if (cmdPtr) m._free(cmdPtr); cmdPtr = m._malloc(cmd.length); cmdTam = cmd.length; }
    m.HEAPU8.set(cmd, cmdPtr);
    m._som_tocar(cmdPtr, cmd.length);
    m._som_mudas(0);
    const onda = m._som_onda(), pos = m._som_onda_pos();
    return {
      sis: 'md', canais: 10, nomes: CANAIS, papeis: PAPEIS, taxa: TAXA,
      encher() { const n = m._som_quadro(); return { b: new Int16Array(m.HEAPU8.buffer, m._som_saida(), n * 2), n: n * 2 }; },
      limpar() {},
      mudas(x) { m._som_mudas(x); },
      onda(v) { return { buf: new Int16Array(m.HEAPU8.buffer, onda, 10 * TAM), base: v * TAM, tam: TAM, pos: m.HEAPU32[(pos >> 2) + v], escala: v < 6 ? 1 / 8192 : 1 / 2100, taxa: 26633 }; },
      nivel: null,
      fechar() { m._som_mudas(0); },
    };
  }
  return { tocador, disponivel };
})();
if (typeof module !== 'undefined') module.exports = KofSomFm;
