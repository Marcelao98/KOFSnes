const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), zlib = require('zlib');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 }, acceptDownloads: true });
  const p = await ctx.newPage(); const erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(500);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(2000);
  const ev = (f, a) => p.evaluate(f, a);
  // jogo para atrás da biblioteca
  const q0 = (await ev(() => KOFnes.marcos()))[1];
  await p.keyboard.press('Control+KeyL'); await p.waitForTimeout(1000);
  const q1 = (await ev(() => KOFnes.marcos()))[1];
  r.quadrosComBibliotecaAberta = q1 - q0 > 5 ? 'RODANDO (' + (q1 - q0) + ')' : 'parado';
  await p.keyboard.press('Escape'); await p.waitForTimeout(11500);
  r.marcos = await ev(() => KOFnes.marcos());
  // relatório
  await p.keyboard.press('F9'); r.dialogo = await p.isVisible('#bug'); r.pausou = await ev(() => KOFnes.pausado());
  await p.fill('#bug-desc', 'teste: o chão some na fase 2');
  const [pop, down] = await Promise.all([ctx.waitForEvent('page'), p.waitForEvent('download'), p.click('[data-acao="bug-enviar"]')]);
  const url = pop.url(); r.urlComeco = url.slice(0, 60); r.temTitulo = decodeURIComponent(url).includes('[bug] MonsterFarmJump: teste: o chão some');
  r.temSha = /SHA-1:\*\* `[0-9a-f]{40}`/.test(decodeURIComponent(url)); r.tamUrl = url.length;
  r.arquivo = down.suggestedFilename(); const cam = saida + '/' + r.arquivo; await down.saveAs(cam);
  const pac = JSON.parse(zlib.gunzipSync(fs.readFileSync(cam)).toString());
  r.pacote = { formato: pac.formato, versao: pac.kofnes, quadros: pac.replay && pac.replay.quadros, temEstado: !!(pac.replay && pac.replay.estado), assinatura: pac.agora.assinatura, kb: Math.round(fs.statSync(cam).size / 1024) };
  r.voltouDoPausado = !(await ev(() => KOFnes.pausado()));
  // quebra de mentira
  await ev(() => KOFnes.forcarErro()); await p.waitForTimeout(300);
  r.quebraAbre = await p.isVisible('#bug'); r.quebraTexto = await p.textContent('#bug-erro');
  await p.screenshot({ path: saida + '/bug-quebra.png' });
  await p.click('#bug [data-acao="bug-fechar"]');
  // biblioteca com muitos jogos
  r.lista500 = await ev(() => KOFnes.testeLista(500));
  await ev(() => { document.body.classList.add('sofa'); });
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
  fs.writeFileSync(saida + '/ultimo-kofbug.txt', cam);
})();
