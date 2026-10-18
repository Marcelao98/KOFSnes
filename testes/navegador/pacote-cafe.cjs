// Pacote Café: os 8 temas aparecem na galeria (categoria "Café"), persistem depois de fechar e abrir,
// o original continua sendo o padrão, e dá pra tirar um print de cada um.
//   node testes/navegador/pacote-cafe.cjs dist/web/KOFnes.html rom.sfc saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida = '/tmp'] = process.argv;
const IDS = ['cafe', 'espresso', 'cappuccino', 'latte', 'mocha', 'caramelo', 'coldbrew', 'canela'];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } }), p = await ctx.newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  const tema = () => p.evaluate(() => document.documentElement.dataset.tema);
  await p.goto('file://' + html); await p.waitForTimeout(500);
  r.padraoDeQuemJaTinha = (await tema()) === 'cafe';                       // instalação sem tema salvo continua no Café queimado
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  const cat = (await p.$$eval('#temas-cats .cat', (l) => l.map((x) => x.textContent))).find((t) => /^Café/.test(t));
  await p.click(`#temas-cats .cat:text-is("${cat}")`);
  r.categoriaCafe = cat; r.naGaleria = await p.$$eval('#grade-temas .previa', (l) => l.map((x) => x.dataset.tema));
  r.osOitoAparecem = IDS.every((i) => r.naGaleria.includes(i)) && r.naGaleria.length === 8;
  await p.screenshot({ path: saida + '/cafe-galeria.png' });
  // escolher pela galeria, fechar e reabrir: persiste
  await p.click('#grade-temas .previa[data-tema="coldbrew"]'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(500); r.persistiu = (await tema()) === 'coldbrew';
  // um print do Início de cada tema
  for (const id of IDS) {
    await p.evaluate((i) => localStorage.setItem('kofnes.tema', i), id); await p.reload(); await p.waitForTimeout(450);
    if ((await tema()) !== id) r['falhou_' + id] = true;
    await p.screenshot({ path: `${saida}/cafe-${id}.png` });
  }
  // menu do botão direito num tema claro e num escuro
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  for (const id of ['cappuccino', 'mocha']) {
    await p.evaluate((i) => { document.documentElement.dataset.tema = i; }, id);
    await p.click('#tela', { button: 'right' }); await p.waitForTimeout(200);
    await p.screenshot({ path: `${saida}/cafe-direito-${id}.png` }); await p.keyboard.press('Escape');
  }
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
