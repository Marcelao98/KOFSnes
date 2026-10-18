// Categorias de temas (Animes, Nostalgia BR, Brasilidades, Clássicos do SNES): contagem, nomes, ids únicos,
// prévias distintas, persistência ao reabrir, padrão intacto e um print do Início de cada tema.
//   node testes/navegador/categorias-temas.cjs /caminho/KOFnes.html saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, saida = '/tmp'] = process.argv;
const ESPERA = { 'Animes': 23, 'Nostalgia BR': 20, 'Brasilidades': 20, 'Clássicos do SNES': 20, 'Café': 8 };
const NOMES_CLASSICOS = ['Super Mario World', 'The Legend of Zelda: A Link to the Past', 'Super Metroid', 'Donkey Kong Country', 'Mega Man X', 'Chrono Trigger', 'Final Fantasy VI', 'EarthBound', 'Kirby Super Star', 'F-Zero', 'Star Fox', 'Super Castlevania IV', 'Contra III', 'Street Fighter II Turbo', 'Mortal Kombat', 'Secret of Mana', 'Super Mario Kart', "Yoshi's Island", "Super Ghouls 'n Ghosts", 'Terranigma'];
const NOMES_BR = ['Tropicália', 'Bossa Nova', 'Samba de Raiz', 'Choro Brasileiro', 'Frevo', 'Maracatu', 'Cordel', 'Azulejo Português', 'Modernismo Brasileiro', 'Concreto de Brasília', 'Mata Atlântica', 'Floresta Amazônica', 'Sertão', 'Pantanal', 'Cerrado', 'Litoral Tropical', 'Ouro Preto', 'Baiana', 'Festa Junina', 'Carnaval de Rua'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  const tema = () => p.evaluate(() => document.documentElement.dataset.tema);
  await p.goto('file://' + html); await p.waitForTimeout(500);
  r.padrao = (await tema()) === 'cafe';
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  const chips = await p.$$eval('#temas-cats .cat', (l) => l.map((x) => x.textContent));
  const porCat = {};
  for (const chip of chips.filter((c) => !/^Todos/.test(c))) {
    await p.click(`#temas-cats .cat:text-is("${chip}")`); await p.waitForTimeout(150);
    porCat[chip.replace(/ · \d+$/, '')] = await p.$$eval('#grade-temas .previa', (l) => l.map((x) => ({ id: x.dataset.tema, nome: x.querySelector('.pv-nome').textContent, desc: x.querySelector('.pv-desc').textContent,
      cor: getComputedStyle(x.querySelector('.pv-bot')).backgroundColor + getComputedStyle(x.querySelector('.pv-corpo')).backgroundColor })));
  }
  r.categorias = Object.fromEntries(Object.entries(porCat).map(([k, v]) => [k, v.length]));
  r.contagens = Object.entries(ESPERA).every(([k, n]) => (porCat[k] || []).length === n);
  r.nomesClassicos = NOMES_CLASSICOS.every((n, i) => porCat['Clássicos do SNES'][i].nome === n);
  r.nomesBrasilidades = NOMES_BR.every((n, i) => porCat['Brasilidades'][i].nome === n);
  const todos = Object.values(porCat).flat(); const ids = todos.map((x) => x.id);
  r.idsUnicos = new Set(ids).size === ids.length; r.total = ids.length;
  const nomes = Object.entries(porCat).flatMap(([c, l]) => l.map((x) => c + '|' + x.nome.toLowerCase())); r.nomesUnicosNaCategoria = new Set(nomes).size === nomes.length;
  for (const c of ['Animes', 'Nostalgia BR', 'Brasilidades', 'Clássicos do SNES']) r['previasDistintas_' + c] = new Set(porCat[c].map((x) => x.cor)).size === porCat[c].length && porCat[c].every((x) => x.desc.length > 8);
  await p.click('#temas-cats .cat[data-cat="Brasilidades"]'); await p.screenshot({ path: saida + '/galeria-brasilidades.png' });
  await p.click('#temas-cats .cat[data-cat="Clássicos do SNES"]'); await p.screenshot({ path: saida + '/galeria-classicos.png' });
  for (const id of ids) {
    await p.evaluate((i) => localStorage.setItem('kofnes.tema', i), id); await p.reload(); await p.waitForTimeout(250);
    if ((await tema()) !== id) r['falhou_' + id] = true;
    if (/^(tropicalia|bossa|samba|choro|frevo|maracatu|cordel|azulejo|modernismo|brasilia|mataatlantica|amazonica|sertao|pantanal|cerrado|litoral|ouropreto|baiana|junina|carnaval|smw|alttp|metroid|dkc|mmx|chrono|ff6|earthbound|kirby|fzero|starfox|cv4|contra|sf2|mk|mana|mariokart|yoshi|ghouls|terranigma|detetive|folhas|mar|alquimia|cadernomorte|lamina|digital|cartas|cacadores|respiracao|maldicao|motosserra|alem|familia|caos|trem|mononoke|esferas|dourado|pokebola)$/.test(id)) await p.screenshot({ path: `${saida}/t-${id}.png` });
  }
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
