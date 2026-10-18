// Showcase dos temas: o botão da galeria passa os temas sozinho; Esc volta, "Ficar com este" escolhe.
//   node testes/navegador/showcase.cjs dist/web/KOFnes.html
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const tema = () => p.evaluate(() => document.documentElement.dataset.tema);
  r.antes = await tema();
  await p.click('#home [data-acao="temas"]'); await p.waitForTimeout(300);
  await p.click('[data-acao="showcase"]'); await p.waitForTimeout(300);
  r.galeriaFechou = await p.evaluate(() => document.getElementById('temas').hidden);
  r.barra = await p.isVisible('#showcase');
  const vistos = new Set([await tema()]);
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(3700); vistos.add(await tema()); }
  r.temasVistos = vistos.size; r.nome = await p.textContent('#showcase-nome'); r.contador = await p.textContent('#showcase-n');
  await p.screenshot({ path: (process.argv[3] || '/tmp') + '/showcase.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  r.escVoltou = (await tema()) === r.antes && !(await p.isVisible('#showcase'));
  // parou mesmo: o tema não muda mais
  const fixo = await tema(); await p.waitForTimeout(4000); r.parou = (await tema()) === fixo;
  // "Ficar com este" escolhe o que está na tela e guarda
  await p.click('#home [data-acao="temas"]'); await p.click('[data-acao="showcase"]'); await p.waitForTimeout(4000);
  const naTela = await tema(); await p.click('[data-acao="showcase-ficar"]'); await p.waitForTimeout(300);
  r.ficou = (await tema()) === naTela && (await p.evaluate(() => localStorage.getItem('kofnes.tema'))) === naTela;
  // rápido: meio segundo por tema, em 2,6 s passa de uns 4 temas diferentes; Esc volta
  await p.click('#home [data-acao="temas"]'); await p.click('[data-acao="showcase-rapido"]');
  const rap = new Set([await tema()]); for (let i = 0; i < 5; i++) { await p.waitForTimeout(520); rap.add(await tema()); }
  r.rapidoTemasVistos = rap.size; r.rapidoClasse = await p.evaluate(() => document.documentElement.classList.contains('showcase-rapido'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(900);
  r.rapidoVoltou = !(await p.evaluate(() => document.documentElement.classList.contains('showcase-rapido'))) && !(await p.isVisible('#showcase'));
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
