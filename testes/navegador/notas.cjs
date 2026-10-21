// Jukebox, modo 🎹 Notas (piano roll): (1) precisão do detector de nota (YIN) com ondas sintéticas de frequência conhecida,
// senoide e quadrada (como um pulso de chip 8 bits), em duas taxas, e ruído (tem de virar "bateria"); (2) custo por quadro;
// (3) o piano desenha no tempo do que está saindo no alto-falante, não do que foi gerado; (4) uma música da Trilha tocando na jukebox no modo Notas, com prints do PC e do celular.
//   node testes/navegador/notas.cjs dist/web [prints/]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const os = require('os'), path = require('path');
const [,, pasta, saida = os.tmpdir()] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [], conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const tk = (taxa, gerar) => { const buf = new Int16Array(4096); for (let i = 0; i < 4096; i++) buf[i] = gerar(i / taxa) * 12000; return { taxa, canais: 1, onda: () => ({ buf, base: 0, tam: 4096, pos: 0, escala: 1 / 16000, taxa }) }; };
    const out = [];
    for (const taxa of [32000, 26633]) for (const [nome, f] of [['A4', 440], ['C3', 130.81], ['E6', 1318.5], ['G2', 98]]) {
      const esperada = 69 + 12 * Math.log2(f / 440);
      const seno = KOFnes.notaDoCanal(tk(taxa, (t) => Math.sin(2 * Math.PI * f * t)), 0);
      const quad = KOFnes.notaDoCanal(tk(taxa, (t) => ((t * f) % 1 < 0.25 ? 1 : -0.4)), 0);   // pulso 25% (NES/GB)
      out.push([taxa, nome, esperada, seno && seno.nota, quad && quad.nota]);
    }
    let x = 1; const ruido = KOFnes.notaDoCanal(tk(32000, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff * 2 - 1; }), 0);
    const silencio = KOFnes.notaDoCanal(tk(32000, () => 0), 0);
    const t0 = performance.now(), T = tk(55500, (t) => Math.sin(2 * Math.PI * 220 * t));
    for (let i = 0; i < 100; i++) for (let c = 0; c < 10; c++) KOFnes.notaDoCanal(T, 0);
    return { out, ruido, silencio, ms: (performance.now() - t0) / 100 };
  });
  for (const [taxa, nome, esp, seno, quad] of r.out) conferir(Math.abs(seno - esp) < 0.3 && Math.abs(quad - esp) < 0.3, `${nome} a ${taxa} Hz: esperada ${esp.toFixed(2)}, senoide ${seno && seno.toFixed(2)}, quadrada ${quad && quad.toFixed(2)}`);
  conferir(r.ruido && r.ruido.ruido, 'ruído vira bateria (sem nota)');
  conferir(r.silencio === null, 'silêncio não desenha nada');
  conferir(r.ms < 6, `10 canais por quadro custam ${r.ms.toFixed(2)} ms (o quadro tem 16,7 ms)`);
  // música de verdade
  for (const [nome, vp] of [['pc', { width: 1280, height: 800 }], ['celular', { width: 390, height: 844 }]]) {
    const q = await (await b.newContext({ viewport: vp, isMobile: nome === 'celular', hasTouch: nome === 'celular' })).newPage();
    await q.goto('file://' + path.resolve(pasta, nome === 'pc' ? 'KOFnes.html' : 'KOFnes-android.html')); await q.waitForTimeout(1000);
    await q.evaluate(() => document.querySelector('[data-acao="jukebox"]').click()); await q.waitForTimeout(800);
    await q.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].find((li) => /Tico/.test(li.textContent)).click()); await q.waitForTimeout(500);
    await q.evaluate(() => document.querySelector('[data-acao="jk-vista-notas"]').click());
    await q.waitForTimeout(6000);
    const st = await q.evaluate(() => ({ vista: KOFnes.juke().vista, segs: KOFnes.notas().map((n) => n.seg.length), tons: KOFnes.notas().map((n) => n.seg.filter((s) => s.tipo !== 'r').length) }));
    const total = st.segs.reduce((a, x) => a + x, 0);
    const atrasos = []; for (let i = 0; i < 5; i++) { atrasos.push(await q.evaluate(() => KOFnes.atrasoNotas())); await q.waitForTimeout(200); }
    conferir(atrasos.every((x) => x > 0.03 && x < 0.6), `${nome}: piano no tempo do alto-falante (o som sai ${atrasos.map((x) => Math.round(x * 1000)).join('/')} ms depois de gerado)`);
    conferir(st.vista === 'notas' && total > 20 && st.tons.filter((x) => x > 3).length >= 3, `${nome}: Tico-Tico no modo Notas (${total} notas; por canal ${st.segs.join(',')})`);
    await q.screenshot({ path: path.join(saida, `notas-${nome}.png`) });
  }
  console.log(falhas.length ? falhas.length + ' falha(s)' : 'tudo certo');
  await b.close(); process.exit(falhas.length ? 1 : 0);
})();
