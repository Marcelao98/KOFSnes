const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const nomes = ['Super Mario World (U) [!]', 'BS Super Mario Collection 3 (J) [h1]', 'Super Mario All-Stars (U) [b1]', 'Chrono Trigger (U) [!]', 'Chrono Trigger - Character Library (J) [h1]', 'Animaniacs (U) [!]', 'Aladdin (U) [T+Por]', 'Madou Monogatari - Hanamaru Daiyouchienji (J)', 'Donkey Kong Country (U) (V1.1) [!]', 'Ação Ótima (B)'];
  r.montar3000 = await p.evaluate((n) => KOFnes.testeLista(3000, n), nomes);
  r.dom = await p.locator('#roms li').count(); r.estado = await p.textContent('#bib-estado');
  const busca = async (t) => { await p.fill('#filtro', t); await p.waitForTimeout(400); return { n: await p.locator('#roms li').count(), primeiro: (await p.textContent('#roms li >> nth=0').catch(() => '')).slice(0, 60), estado: await p.textContent('#bib-estado') }; };
  r.superMario = await busca('super mario'); r.marioSuper = await busca('mario super'); r.acento = await busca('acao otima');
  r.animaniacs = await busca('animaniacs'); r.errado = await busca('anamianiacs');
  await p.click('[data-acao="so-principais"]'); r.comVariantes = await busca('super mario');
  await p.fill('#filtro', 'bs super mario'); await p.waitForTimeout(400);
  await p.screenshot({ path: saida + '/bib-normal.png' });
  await p.evaluate(() => document.body.classList.add('sofa')); await p.evaluate(() => KOFnes.testeLista(10, ['BS Super Mario Collection 3 (J) [h1]']));
  await p.screenshot({ path: saida + '/bib-sofa.png' });
  // tema pela galeria com a biblioteca aberta: volta pra biblioteca
  await p.evaluate(() => document.body.classList.remove('sofa'));
  await p.click('#menu .m > button:text-is("Tema")'); await p.waitForTimeout(200);
  await p.click('.previa[data-tema="terminal"]'); await p.waitForTimeout(200);
  r.bibliotecaVoltou = await p.isVisible('#biblioteca');
  await p.click('#menu .m > button:text-is("Tema")'); await p.keyboard.press('Escape'); r.escVolta = await p.isVisible('#biblioteca');
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
