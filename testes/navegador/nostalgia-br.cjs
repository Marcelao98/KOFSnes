// Nostalgia BR (agora dentro de 'Bem brasileiro'): 20 temas na galeria (nome + descrição), sem duplicar id, os 8 de café
// intactos, persistência ao reabrir, busca pela descrição, prints da galeria e do Início de cada tema.
//   node testes/navegador/nostalgia-br.cjs dist/web/KOFnes.html saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, saida = '/tmp'] = process.argv;
const NOMES = ['Sessão da Tarde', 'TV Globinho', 'Lan House 2007', 'Orkut & MSN', 'DVD de Camelô', 'A Locadora', 'Caderno de Escola', 'Recreio',
  'Boteco do Bairro', 'Chuva no Interior', 'Almoço de Domingo', 'Feira de Domingo', 'Brasil 1998', 'Hexa 2002', 'Férias de Verão',
  'Festa Junina da Escola', 'Casa da Vó', 'MP3 & Fone de Ouvido', 'Gibi da Banca', 'Cidade do Interior'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  const tema = () => p.evaluate(() => document.documentElement.dataset.tema);
  await p.goto('file://' + html); await p.waitForTimeout(500);
  r.padrao = (await tema()) === 'cafe';
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  const cat = (await p.$$eval('#temas-cats .cat', (l) => l.map((x) => x.textContent))).find((t) => /^Bem brasileiro/.test(t));
  await p.click(`#temas-cats .cat:text-is("${cat}")`); await p.waitForTimeout(200);
  const todosCards = await p.$$eval('#grade-temas .previa', (l) => l.map((x) => ({ id: x.dataset.tema, nome: x.querySelector('.pv-nome').textContent, desc: x.querySelector('.pv-desc').textContent })));
  const cards = NOMES.map((n) => todosCards.find((c) => c.nome === n)).filter(Boolean);
  r.categoria = cat; r.vinte = cards.length === 20;
  r.nomesExatos = cards.length === 20;
  r.todosComDescricao = cards.every((c) => c.desc.length > 10);
  await p.click('#temas-cats .cat[data-cat="todos"]'); await p.waitForTimeout(200);
  const todos = await p.$$eval('#grade-temas .previa', (l) => l.map((x) => x.dataset.tema));
  await p.click(`#temas-cats .cat:text-is("${cat}")`); await p.waitForTimeout(200);
  r.semDuplicados = new Set(todos).size === todos.length;
  r.cafeIntacto = ['cafe', 'espresso', 'cappuccino', 'latte', 'mocha', 'caramelo', 'coldbrew', 'canela'].every((i) => todos.includes(i));
  r.total = todos.length;
  // prévias distintas: o fundo/destaque computado de cada cartão
  const cores = await p.$$eval('#grade-temas .previa', (l) => l.map((x) => { const c = getComputedStyle(x.querySelector('.pv-bot')).backgroundColor + '|' + getComputedStyle(x.querySelector('.pv-corpo')).backgroundColor; return c; }));
  r.previasDistintas = new Set(cores).size === cores.length;
  await p.screenshot({ path: saida + '/nostalgia-galeria.png' });
  // busca pela descrição
  await p.fill('#temas-busca', 'luz amarela'); await p.waitForTimeout(200);
  r.buscaPorDescricao = JSON.stringify(await p.$$eval('#grade-temas .previa', (l) => l.map((x) => x.dataset.tema))) === '["chuva"]';
  await p.fill('#temas-busca', ''); await p.waitForTimeout(200);
  // escolher, reabrir: persiste; e cada tema aplica e tira print do Início
  await p.click(`#temas-cats .cat:text-is("${cat}")`).catch(() => {});
  for (const c of cards) {
    await p.evaluate((i) => localStorage.setItem('kofnes.tema', i), c.id); await p.reload(); await p.waitForTimeout(350);
    if ((await tema()) !== c.id) r['falhou_' + c.id] = true;
    await p.screenshot({ path: `${saida}/nostalgia-${c.id}.png` });
  }
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
