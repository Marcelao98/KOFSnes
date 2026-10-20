// Trilha do KOFstation no som do Mega Drive: o Início só carrega a música depois do primeiro toque/tecla, toca no FM
// (Genesis Plus GX, 10 canais), o botão "🎵 ..." do Início troca a música (as 5, sortear, desligada) e a jukebox mostra
// a trilha e toca as faixas dela.
//   node testes/navegador/trilha.cjs dist/web
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [,, pasta] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const p = await b.newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(1000);
  const juke = () => p.evaluate(() => KOFnes.juke());
  conferir(!(await juke()).tocando && !(await p.evaluate(() => document.querySelector('script[src*="genplus"]'))), 'antes do primeiro toque: sem música e sem núcleo carregado');
  await p.mouse.click(5, 300); await p.waitForTimeout(2500);
  let j = await juke();
  conferir(j.tocando && j.interna === 'rua' && j.sisMusica === 'md' && j.canais === 10, `depois do toque: "Se Essa Rua" no FM do Mega Drive ${JSON.stringify(j)}`);
  const nomes = [];
  for (let i = 0; i < 7; i++) {
    await p.evaluate(() => document.querySelector('.hm-rodape [data-acao="musica-inicio"]').click()); await p.waitForTimeout(1500);
    j = await juke(); nomes.push((await p.textContent('.hm-rodape [data-acao="musica-inicio"]')) + '=' + (j.tocando ? j.interna : 'nada'));
  }
  conferir(nomes.join(' | ').includes('O Guarani=guarani') && nomes.join(' | ').includes('desligada=nada') && /sortear=(rua|guarani|ticotico|abrealas|balao|air)/.test(nomes.join(' | ')), 'o botão troca a música do Início: ' + nomes.join(' | '));
  await p.evaluate(() => document.querySelector('[data-acao="jukebox"]').click()); await p.waitForTimeout(800);
  const faixas = await p.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].map((li) => li.textContent).filter((t) => /Tico|Guarani|Air|Abre|Balão|Rua/.test(t)).length);
  conferir(faixas >= 6, `a jukebox mostra as ${faixas} músicas da trilha`);
  await p.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].find((li) => /Tico/.test(li.textContent)).click()); await p.waitForTimeout(2500);
  j = await juke();
  conferir(j.tocando && !j.interna && j.canais === 10 && j.amostras > 1000, `Tico-Tico tocando na jukebox com os 10 canais ${JSON.stringify({ t: j.tocando, c: j.canais, a: j.amostras })}`);
  conferir(erros.length === 0, 'sem erro na página ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
