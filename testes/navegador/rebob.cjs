const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 720 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(8000);
  const ev = (f) => p.evaluate(f);
  r.antes = await ev(() => KOFnes.rebob()); const sig0 = await ev(() => KOFnes.assinatura());
  await p.keyboard.down('Backspace'); await p.waitForTimeout(1500); r.aviso = await p.textContent('#aviso');
  await p.keyboard.up('Backspace'); await p.waitForTimeout(100);
  r.depois = await ev(() => KOFnes.rebob()); r.voltouImagem = (await ev(() => KOFnes.assinatura())) !== sig0;
  r.continuaRodando = !(await ev(() => KOFnes.pausado()));
  await p.waitForTimeout(1500);
  // pausado: volta, continua pausado, F5 guarda aquele momento
  await p.keyboard.press('KeyP'); await p.keyboard.down('Backspace'); await p.waitForTimeout(600); await p.keyboard.up('Backspace');
  r.ficouPausado = await ev(() => KOFnes.pausado());
  await p.keyboard.press('F5'); await p.waitForTimeout(800); await p.keyboard.press('F6'); await p.waitForTimeout(600);
  r.cartoes = await p.locator('#grade-estados .cartao').count(); await p.keyboard.press('Escape'); await p.keyboard.press('KeyP');
  await p.waitForTimeout(3000);
  // menu rápido: Voltar 5 segundos
  await p.keyboard.press('F2'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  r.item = await p.textContent('#rapido-lista li.sel span'); const f0 = (await ev(() => KOFnes.rebob())).fotos;
  await p.keyboard.press('Enter'); await p.waitForTimeout(200); r.menuVoltou = f0 - (await ev(() => KOFnes.rebob())).fotos; r.aviso2 = await p.textContent('#aviso');
  r.menuSegueAberto = await ev(() => KOFnes.rapido()); await p.keyboard.press('Escape');
  // fps com rebobinar ligado
  await p.waitForTimeout(2500); r.fps = await p.textContent('#st-fps');
  for (const m of ['tv80', 'tv90', 'fliperama']) {
    await p.click('#menu .m > button:text-is("Imagem")'); await p.click(`[data-moldura="${m}"]`); await p.waitForTimeout(400);
    await p.screenshot({ path: `${saida}/m-${m}.png` });
  }
  r.moldura = await ev(() => KOFnes.moldura()); r.tam = await ev(() => KOFnes.tamTela());
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
