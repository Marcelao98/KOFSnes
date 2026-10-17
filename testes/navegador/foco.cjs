// Tirar print / trocar de janela (blur + focus) não pode mudar de tela, e a pausa ao sair tem que soltar na volta.
//   node testes/navegador/foco.cjs dist/web/KOFnes.html rom.sfc
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(400);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1200);
  const tela = () => p.evaluate(() => ['home', 'biblioteca', 'estados', 'jukebox', 'estatisticas', 'guia', 'teclas', 'perfil'].find((id) => !document.getElementById(id).hidden) || 'jogo');
  const trocar = async () => { await p.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); }); await p.waitForTimeout(400); };
  for (const t of ['biblioteca', 'jukebox', 'estatisticas', 'guia']) {   // com jogo carregado, em cada tela
    await p.click(`#lateral [data-tela="${t}"]`); await p.waitForTimeout(500);
    await trocar(); r['ficaEm_' + t] = (await tela()) === t;
  }
  await p.click('#lateral [data-acao="voltar-jogo"]'); await p.waitForTimeout(400);
  await p.evaluate(() => dispatchEvent(new Event('blur'))); r.pausouAoSair = await p.evaluate(() => KOFnes.pausado());
  await p.evaluate(() => dispatchEvent(new Event('focus'))); r.retomouAoVoltar = !(await p.evaluate(() => KOFnes.pausado()));
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
