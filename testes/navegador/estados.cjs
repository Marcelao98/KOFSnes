// biblioteca + savestates no navegador de verdade (Chromium)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom1, rom2, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 760 } });
  const p = await ctx.newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await p.goto('file://' + html); await p.waitForTimeout(500);
  r.inicioAbreSozinho = await p.isVisible('#home');
  const abre = async (rom) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]); await fc.setFiles(rom); await p.waitForTimeout(2500); };
  await abre(rom1);
  r.jogo1 = await p.evaluate(() => KOFnes.estado().jogoId);
  await p.keyboard.press('F5'); await p.waitForTimeout(800);
  await p.waitForTimeout(3000);
  await p.keyboard.press('F5'); await p.waitForTimeout(800);
  await p.keyboard.press('F6'); await p.waitForTimeout(800);
  r.cartoesJogo1 = await p.locator('#grade-estados .cartao').count();
  await p.screenshot({ path: saida + '/galeria.png' });
  await p.keyboard.press('Escape');
  // segundo jogo, pela biblioteca (Ctrl+L) -> adicionar
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(500);
  await abre(rom2);
  r.jogo2 = await p.evaluate(() => KOFnes.estado().jogoId);
  // galeria: escolhe o jogo 1 e carrega um estado dele -> tem que trocar de jogo sozinho
  await p.keyboard.press('F6'); await p.waitForTimeout(800);
  await p.selectOption('#estados-jogo', r.jogo1); await p.waitForTimeout(500);
  await p.click('#grade-estados .cartao >> nth=0'); await p.waitForTimeout(1500);
  r.trocouProJogo1 = (await p.evaluate(() => KOFnes.estado().jogoId)) === r.jogo1;
  // recarrega: biblioteca lembra os dois jogos, com capa e estados
  await p.reload(); await p.waitForTimeout(1200); await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(600);
  r.itensNaBiblioteca = await p.locator('#roms li').count();
  r.info = await p.textContent('#info-det');
  await p.screenshot({ path: saida + '/biblioteca.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  r.enterJoga = (await p.evaluate(() => KOFnes.estado().snes));
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
