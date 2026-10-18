// Galeria de temas com categorias e busca, tema no menu do botão direito e showcase só da categoria.
//   node testes/navegador/temas-menu.cjs dist/web/KOFnes.html rom.sfc [saida/]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 760 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const previas = () => p.$$eval('#grade-temas .previa', (l) => l.map((b) => b.dataset.tema));
  const aberta = () => p.evaluate(() => !document.getElementById('temas').hidden);
  r.contadorInicio = await p.textContent('#home .n-temas');
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  const cats = await p.$$eval('#temas-cats .cat', (l) => l.map((b) => b.textContent));
  r.categorias = cats; const todos = await previas(); r.total = todos.length;
  r.contadorBate = cats[0] === `Todos · ${todos.length}` && r.contadorInicio === String(todos.length);
  // categoria
  const anime = cats.find((c) => /^Anime/.test(c)); await p.click(`#temas-cats .cat:text-is("${anime}")`);
  const soAnime = await previas(); r.animeConfere = anime === `Anime · ${soAnime.length}` && (await p.$$eval('#grade-temas h3', (l) => l.length)) === 1;
  await p.screenshot({ path: saida + '/temas-menu.png' });
  // showcase só dessa categoria
  await p.click('[data-acao="showcase"]'); await p.waitForTimeout(300);
  const vistos = new Set(); for (let i = 0; i < 3; i++) { vistos.add(await p.evaluate(() => document.documentElement.dataset.tema)); await p.waitForTimeout(3700); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  r.showcaseSoDaCategoria = [...vistos].every((t) => soAnime.includes(t)) && vistos.size >= 2;
  // busca digitando sem clicar em nada, sem acento, Esc limpa, Esc fecha
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  await p.keyboard.type('cafe'); r.digitouNaBusca = (await p.inputValue('#temas-busca')) === 'cafe';
  const achou = await previas(); r.achouSemAcento = achou.includes('cafe') && achou.length < todos.length;
  await p.keyboard.press('Escape'); r.escLimpa = (await p.inputValue('#temas-busca')) === '' && (await aberta()) && (await previas()).length === todos.length;
  await p.keyboard.type('zzzzzz'); r.nenhum = /nenhum tema/.test(await p.textContent('#grade-temas'));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); r.escFecha = !(await aberta());
  // Enter na busca escolhe o primeiro
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300); await p.keyboard.type('neon'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  r.enterEscolheu = (await p.evaluate(() => document.documentElement.dataset.tema)) === 'neon' && !(await aberta());
  // menu do botão direito: tema com ◀▶, Enter abre a galeria
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  await p.click('#tela', { button: 'right' });
  const itens = await p.$$eval('#rapido-lista li > span:first-child', (l) => l.map((e) => e.textContent)); r.temaNoBotaoDireito = itens.includes('🎨 Tema');
  const i = itens.indexOf('🎨 Tema'); for (let k = 0; k < i; k++) await p.keyboard.press('ArrowDown');
  const antes = await p.evaluate(() => document.documentElement.dataset.tema); await p.keyboard.press('ArrowRight');
  r.trocouNoMenu = (await p.evaluate(() => document.documentElement.dataset.tema)) !== antes;
  await p.screenshot({ path: saida + '/temas-direito.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  r.enterAbreGaleria = (await aberta()) && !(await p.evaluate(() => KOFnes.rapido()));
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
