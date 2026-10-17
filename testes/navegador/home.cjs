const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  const tela = () => p.evaluate(() => ['home', 'biblioteca', 'estados', 'jukebox', 'estatisticas', 'guia', 'teclas'].find((id) => !document.getElementById(id).hidden) || 'jogo');
  await p.goto('file://' + html); await p.waitForTimeout(700);
  r.abreNoInicio = await tela(); r.primeiraVez = await p.textContent('#hm-destaque h2'); r.saudacao = await p.textContent('#hm-saudacao');
  await p.screenshot({ path: saida + '/home-vazia.png' });
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(2500); r.abriuJogo = await tela();
  await p.keyboard.press('Home'); await p.waitForTimeout(500); r.homeComJogo = await p.textContent('#hm-destaque .hm-rotulo'); r.pausado = await p.evaluate(() => KOFnes.pausado());
  await p.screenshot({ path: saida + '/home-jogando.png' });
  await p.click('#hm-destaque [data-acao="voltar-jogo"]'); await p.waitForTimeout(300); r.voltouAoJogo = await tela();
  // histórico: início -> biblioteca -> guia -> voltar -> voltar -> voltar
  await p.keyboard.press('Home'); await p.waitForTimeout(300);
  await p.click('#lateral [data-acao="biblioteca"]'); await p.waitForTimeout(500);
  await p.click('#lateral [data-acao="guia"]'); await p.waitForTimeout(400);
  r.guia = await tela();
  await p.click('#lateral [data-acao="voltar"]'); await p.waitForTimeout(500); r.voltar1 = await tela();
  await p.keyboard.press('Escape'); await p.waitForTimeout(500); r.voltar2Esc = await tela();
  await p.keyboard.press('Alt+ArrowLeft'); await p.waitForTimeout(500); r.voltar3Alt = await tela();
  // tema muda a frase do início
  await p.keyboard.press('Home'); await p.waitForTimeout(300);
  await p.click('#lateral [data-acao="temas"]'); await p.waitForTimeout(300);
  await p.hover('.previa[data-tema="terminal"]'); r.fraseTerminal = await p.textContent('#hm-saudacao');
  await p.click('.previa[data-tema="classico98"]'); await p.waitForTimeout(300); r.voltaProInicio = await tela(); r.frase98 = await p.textContent('#hm-saudacao');
  await p.mouse.move(20, 300); await p.waitForTimeout(400);
  await p.screenshot({ path: saida + '/home-98-lateral.png' });
  // guia: página de atalhos tem a tabela
  await p.click('#lateral [data-acao="guia"]'); await p.click('[data-guia="atalhos"]'); r.tabelaAtalhos = (await p.textContent('#tab-ajuda')).length > 100;
  await p.click('[data-guia="tempo"]'); await p.screenshot({ path: saida + '/guia.png' });
  // recarrega: Continuar
  await p.evaluate(() => KOFnes.estado()); await p.keyboard.press('Escape');
  await p.waitForTimeout(31000);
  await p.reload(); await p.waitForTimeout(1200);
  r.depoisDeRecarregar = await tela(); r.continuar = await p.textContent('#hm-destaque .grande');
  await p.evaluate(() => { document.documentElement.dataset.tema = 'terminal'; }); await p.keyboard.press('Escape');
  await p.screenshot({ path: saida + '/home-continuar.png' });
  await p.click('#hm-destaque [data-acao="hm-continuar"]'); await p.waitForTimeout(2500); r.continuou = await tela();
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
