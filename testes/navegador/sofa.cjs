const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom1, rom2, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'warning' && /auto|bibli/.test(m.text())) erros.push(m.text()); });
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const abre = async (rom) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]); await fc.setFiles(rom); await p.waitForTimeout(6000); };
  await abre(rom1);                                   // joga um pouco o "Mario"
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(400);
  await abre(rom2);                                   // trocar de jogo salva o automático do primeiro
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(6000);   // tempo de baixar as capas
  const sel = async () => ({ nome: await p.textContent('#info-nome'), det: await p.textContent('#info-det'),
    botao: await p.textContent('[data-acao="jogar"]'), oficial: await p.evaluate(() => document.querySelector('#capa-img').classList.contains('oficial')) });
  // o "Mario" tem que estar na lista; seleciona ele
  const itens = await p.locator('#roms li').allTextContents();
  const iMario = itens.findIndex((t) => t.includes('Super Mario'));
  for (let k = 0; k < iMario; k++) await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(1500);
  r.mario = await sel();
  await p.screenshot({ path: saida + '/bib-capa.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  r.continuouNoMario = (await p.evaluate(() => KOFnes.estado().romNome)).includes('Super Mario');
  r.aviso = await p.textContent('#aviso');
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(600);
  await p.click('#biblioteca [data-acao="sofa"]'); await p.waitForTimeout(1500);
  r.selecionadoNoSofa = await p.textContent('#info-nome');
  r.sofa = await p.evaluate(() => document.body.classList.contains('sofa'));
  await p.screenshot({ path: saida + '/sofa.png' });
  const antes = await p.textContent('#info-nome'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  r.setaDireitaMuda = antes !== await p.textContent('#info-nome');
  await p.reload(); await p.waitForTimeout(1500);
  r.depoisDeRecarregar = { sofa: await p.evaluate(() => document.body.classList.contains('sofa')), itens: await p.locator('#roms li').count(),
    capasNoBanco: await p.evaluate(async () => { const d = await new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => ok(q.result); });
      return new Promise((ok) => { const g = d.transaction('jogos').objectStore('jogos').getAll(); g.onsuccess = () => ok(g.result.map((j) => j.nome + ':' + (j.boxart ? 'capa' : 'sem') + ':' + (j.auto ? 'auto' : '-'))); }); }) };
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
