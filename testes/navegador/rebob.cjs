// Rebobinar estilo Príncipe da Pérsia: até o limite, preto e branco, depois recarrega.
//   node testes/navegador/rebob.cjs dist/web/KOFnes.html rom.sfc saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 720 } })).newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const ev = (f, a) => p.evaluate(f, a);
  await p.evaluate(() => localStorage.setItem('kofnes.rebobLimite', '3')); await p.reload(); await p.waitForTimeout(500);   // 3 s (recarga de 18 s) pra o teste ser curto
  r.semMenu = (await p.locator('#menu [data-acao*="rebob"]').count()) === 0;
  r.limite = await ev(() => KOFnes.rebobEstado().limite);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(6000);
  r.janela = await ev(() => KOFnes.rebobEstado().fotos);               // ~90 fotos = 3 s, e não cresce sem limite
  r.janelaNoLimite = r.janela <= 91 && r.janela >= 60;
  // segurar: preto e branco, vai gastando, para sozinho no fim
  await p.keyboard.down('Backspace'); await p.waitForTimeout(500);
  r.filtroDuranteRebobinar = await ev(() => getComputedStyle(document.getElementById('tela')).filter);
  r.classe = await ev(() => document.body.classList.contains('rebobinando'));
  r.ampulhetaRebobinando = await p.textContent('#ampulheta');
  await p.screenshot({ path: saida + '/rebobinando.png' });
  await p.waitForTimeout(3500); await p.keyboard.up('Backspace'); await p.waitForTimeout(300);
  const e1 = await ev(() => KOFnes.rebobEstado());
  r.depoisDeUsar = e1; r.zerou = e1.recarga > 0 && !e1.ativo;   // (soltar depois do fim: o jogo já voltou a rodar e a gravar fotos novas)
  r.semFiltro = !(await ev(() => document.body.classList.contains('rebobinando')));
  r.ampulhetaRecarga = await p.textContent('#ampulheta');
  // tentar de novo logo em seguida: travado, o jogo segue rodando
  await p.keyboard.down('Backspace'); await p.waitForTimeout(700);
  r.travado = !(await ev(() => document.body.classList.contains('rebobinando'))); r.avisoTravado = await p.textContent('#aviso');
  await p.keyboard.up('Backspace');
  r.jogoSeguiu = !(await ev(() => KOFnes.pausado()));   // não congela: segue rodando enquanto a ampulheta recarrega
  // pausado não rebobina
  await p.keyboard.press('KeyP'); await p.keyboard.down('Backspace'); await p.waitForTimeout(300);
  r.pausadoNaoRebobina = !(await ev(() => document.body.classList.contains('rebobinando'))); await p.keyboard.up('Backspace'); await p.keyboard.press('KeyP');
  // não tem mais "Voltar 5 segundos" no menu rápido
  await p.keyboard.press('F2'); r.itensRapido = await p.locator('#rapido-lista li').allTextContents(); await p.keyboard.press('Escape');
  // recarrega jogando (18 s) e volta a funcionar
  await p.waitForTimeout(19500);
  const e2 = await ev(() => KOFnes.rebobEstado()); r.recarregou = e2.recarga === 0; r.fotosDeNovo = e2.fotos > 30;
  r.ampulhetaSumiu = await ev(() => document.getElementById('ampulheta').hidden);
  await p.keyboard.down('Backspace'); await p.waitForTimeout(400);
  r.rebobinaDeNovo = await ev(() => document.body.classList.contains('rebobinando')); await p.keyboard.up('Backspace');
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
