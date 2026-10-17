const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 840, height: 760 } });
  const p = await ctx.newPage(); const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html);
  const r = {};
  await p.click('#menu .m:nth-child(2) > button'); await p.click('.sub [data-acao="teclas"]');
  await p.click('#grade-teclas .linha-tecla:nth-child(6) .tecla');      // A
  await p.keyboard.press('KeyK');
  r.depoisK = await p.evaluate(() => KOFnes.mapa().A);
  await p.click('#grade-teclas .linha-tecla:nth-child(6) .tecla');
  await p.keyboard.press('KeyP');                                         // reservada
  r.depoisP = await p.evaluate(() => KOFnes.mapa().A);
  await p.keyboard.press('Escape');
  await p.click('#grade-teclas .linha-tecla:nth-child(5) .tecla');      // B -> K (troca)
  await p.keyboard.press('KeyK');
  r.troca = await p.evaluate(() => ({ A: KOFnes.mapa().A, B: KOFnes.mapa().B }));
  await p.screenshot({ path: saida + '/teclas.png' });
  await p.click('[data-acao="fechar-teclas"]');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  await p.keyboard.down('KeyK'); r.botaoK = (await p.evaluate(() => KOFnes.botoes())).toString(16); await p.keyboard.up('KeyK');
  await p.keyboard.down('KeyZ'); r.botaoZ = (await p.evaluate(() => KOFnes.botoes())).toString(16); await p.keyboard.up('KeyZ');
  await p.reload(); await p.waitForTimeout(500);
  r.depoisDeRecarregar = await p.evaluate(() => ({ A: KOFnes.mapa().A, B: KOFnes.mapa().B }));
  await p.click('#menu .m > button:text-is("Ajuda")'); await p.click('.sub [data-acao="controles"]');
  r.ajuda = (await p.textContent('#tab-ajuda')).replace(/\s+/g, ' ').slice(0, 120);
  await p.screenshot({ path: saida + '/ajuda.png' });
  console.log(JSON.stringify({ ...r, erros }, null, 1));
  await b.close();
})();
