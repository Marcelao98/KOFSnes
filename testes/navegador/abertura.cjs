// Abertura da primeira vez: tela de título -> frases (com a música Air em 8 bits) -> temas passando -> apresentação ->
// guia em 4 passos (jogos, BIOS, tema, dicas) -> Início com "Se Essa Rua" tocando. Confere também: não aparece de novo,
// Pular vai pro guia, abrir um jogo para a música, Ajuda > Boas-vindas reabre, quem já tem jogo não vê. Prints em saida/.
//   node testes/navegador/abertura.cjs dist/web rom.gb saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [,, pasta, rom, saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const vis = (p, s) => p.isVisible(s);
  const juke = (p) => p.evaluate(() => KOFnes.juke());
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { window.__kofAbertura = true; });   // o app esconde a abertura de testes automáticos
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(1200);
    conferir(await vis(p, '#ab-titulo'), `${nome}: primeira vez abre a tela de título`);
    await p.screenshot({ path: `${saida}/ab-${nome}-1-titulo.png` });
    if (cel) await p.tap('#abertura'); else await p.keyboard.press('Enter');
    await p.waitForTimeout(3200);
    conferir(/Shhh/.test(await p.textContent('#ab-frase')) && (await juke(p)).interna === 'air' && (await juke(p)).tocando, `${nome}: frase "Shhh…" com o Air tocando`);
    // o Air é a gravação de violino (nucleos/violino-<hash>.js), não o FM nem o 8 bits
    conferir((await juke(p)).sisMusica === 'violino' && await p.evaluate(() => !!document.querySelector('script[src*="nucleos/violino-"]')), `${nome}: o Air toca no violino de verdade (${(await juke(p)).sisMusica})`);
    await p.screenshot({ path: `${saida}/ab-${nome}-2-frase.png` });
    if (!cel) {   // o filme inteiro, só no PC
      await p.waitForFunction(() => document.querySelector('#ab-tema').textContent.length > 0, null, { timeout: 40000 });
      const t1 = await p.evaluate(() => document.documentElement.dataset.tema); await p.screenshot({ path: `${saida}/ab-pc-3-temas.png` });
      await p.waitForTimeout(2500);
      const t2 = await p.evaluate(() => document.documentElement.dataset.tema);
      conferir(t1 !== t2, `pc: temas nostálgicos passando (${t1} -> ${t2})`);
      await p.waitForFunction(() => /KOFstation/.test(document.querySelector('#ab-frase').textContent), null, { timeout: 40000 });
      await p.waitForTimeout(1500); await p.screenshot({ path: `${saida}/ab-pc-4-apresentacao.png` });
      await p.waitForSelector('#ab-guia:not([hidden])', { timeout: 20000 });
      conferir(await p.evaluate(() => localStorage.getItem('kofnes.tema') === null || document.documentElement.dataset.tema === (localStorage.getItem('kofnes.tema') || 'cafe')), 'pc: depois da montagem o tema volta ao da pessoa');
    } else {
      await p.tap('.ab-pular'); await p.waitForTimeout(500);
      conferir(await vis(p, '#ab-guia'), 'celular: Pular vai direto pro guia');
    }
    // guia
    conferir(await vis(p, '.ab-passo[data-passo="1"]') && (cel ? !(await vis(p, '.ab-passo[data-passo="1"] [data-acao="pasta"]')) : true), `${nome}: passo 1 (jogos)`);
    await p.screenshot({ path: `${saida}/ab-${nome}-5-passo1.png` });
    await p.click('[data-acao="ab-proximo"]'); await p.waitForTimeout(300);
    conferir(/Neo Geo/.test(await p.textContent('.ab-bios')), `${nome}: passo 2 (BIOS) mostra o que falta`);
    await p.screenshot({ path: `${saida}/ab-${nome}-6-passo2.png` });
    await p.click('[data-acao="ab-proximo"]'); await p.waitForTimeout(300);
    await p.click('.ab-temas [data-ab-tema="casavo"]'); await p.waitForTimeout(400);
    conferir(await p.evaluate(() => localStorage.getItem('kofnes.tema') === 'casavo' && document.documentElement.dataset.tema === 'casavo'), `${nome}: passo 3 escolhe o tema (Casa da Vó)`);
    await p.screenshot({ path: `${saida}/ab-${nome}-7-passo3.png` });
    await p.click('[data-acao="ab-proximo"]'); await p.waitForTimeout(300);
    await p.screenshot({ path: `${saida}/ab-${nome}-8-passo4.png` });
    await p.click('[data-acao="ab-proximo"]'); await p.waitForTimeout(800);
    const j = await juke(p);
    conferir(await p.isHidden('#abertura') && await vis(p, '#home') && j.interna === 'rua' && j.tocando, `${nome}: Começar -> Início com "Se Essa Rua" tocando ${JSON.stringify({ interna: j.interna, tocando: j.tocando })}`);
    await p.screenshot({ path: `${saida}/ab-${nome}-9-inicio.png` });
    await p.reload(); await p.waitForTimeout(1200);
    conferir(await p.isHidden('#abertura'), `${nome}: na segunda vez não aparece`);
    await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500);
    const k = await juke(p);
    conferir(!k.interna && !k.tocando, `${nome}: abrir um jogo para a música`);
    if (!cel) {
      await p.evaluate(() => document.querySelector('[data-acao="boas-vindas"]').click()); await p.waitForTimeout(500);
      conferir(await vis(p, '#ab-titulo'), 'pc: Ajuda > Boas-vindas reabre');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    }
    conferir(erros.length === 0, `${nome}: sem erro na página ${erros.join(' | ')}`);
    await ctx.close();
  }
  // quem já usava (jogo na biblioteca e a marca antiga '1') vê a abertura uma vez; fechou, não vê mais
  const ctx = await b.newContext(); await ctx.addInitScript(() => { window.__kofAbertura = true; });
  const p = await ctx.newPage();
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(1000);
  await p.evaluate(() => localStorage.setItem('kofnes.boasVindas', '2')); await p.reload(); await p.waitForTimeout(1000);
  await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500);
  await p.evaluate(() => localStorage.setItem('kofnes.boasVindas', '1')); await p.reload(); await p.waitForTimeout(1500);
  conferir(await p.isVisible('#abertura'), 'quem já tinha jogos (marca antiga) vê a abertura uma vez');
  await p.evaluate(() => document.querySelector('#abertura [data-acao="ab-pular"]').click()); await p.waitForTimeout(500);
  for (let i = 0; i < 6 && await p.isVisible('#abertura'); i++) { await p.evaluate(() => document.querySelector('[data-acao="ab-proximo"]').click()); await p.waitForTimeout(400); }
  await p.reload(); await p.waitForTimeout(1500);
  conferir(await p.isHidden('#abertura'), 'depois de fechar, não aparece de novo');
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
