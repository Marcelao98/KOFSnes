const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom1, rom2] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1100, height: 780 } }); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const abre = async (rom) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]); await fc.setFiles(rom); await p.waitForTimeout(2500); };
  const autoDoJogo1 = () => p.evaluate(async () => { const d = await new Promise((ok) => { const q = indexedDB.open('kofnes'); q.onsuccess = () => ok(q.result); });
    return new Promise((ok) => { const g = d.transaction('jogos').objectStore('jogos').getAll(); g.onsuccess = () => { const j = g.result.find((x) => x.nome.includes('Monster') || x.nome.includes('mfj')); ok(j ? (j.autoQuando || 0) : -1); }; }); });
  // desliga o automático pelo menu
  await p.click('#menu .m:nth-child(2) > button'); await p.click('.sub [data-acao="auto-toggle"]');
  r.desligado = !(await p.evaluate(() => KOFnes.auto()));
  r.textoMenu = await p.textContent('[data-acao="auto-toggle"]');
  await abre(rom1);
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(300); await abre(rom2);   // troca de jogo
  r.autoComDesligado = await autoDoJogo1();
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(800);
  r.botaoDesligado = await p.textContent('[data-acao="jogar"]');
  // liga de novo, joga o 1 e troca: agora tem que gravar e oferecer Continuar
  await p.keyboard.press('Escape');
  await p.click('#menu .m:nth-child(2) > button'); await p.click('.sub [data-acao="auto-toggle"]');
  r.ligado = await p.evaluate(() => KOFnes.auto());
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(800);
  const itens = await p.locator('#roms li').allTextContents(); const i = itens.findIndex((t) => /Monster|mfj/i.test(t));
  await p.click(`#roms li >> nth=${i}`); await p.click(`#roms li >> nth=${i}`); await p.waitForTimeout(2500);
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(300); await abre(rom2);
  r.autoComLigado = (await autoDoJogo1()) > 0;
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(800);
  const itens2 = await p.locator('#roms li').allTextContents(); const i2 = itens2.findIndex((t) => /Monster|mfj/i.test(t));
  await p.click(`#roms li >> nth=${i2}`); await p.waitForTimeout(400);
  r.botaoLigado = await p.textContent('[data-acao="jogar"]');
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
