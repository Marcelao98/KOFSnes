// Matriz tela × ação: chega em cada tela pelo caminho do usuário (menu lateral),
// faz cada ação e anota onde foi parar. Só observa, não decide o que é erro.
//   node testes/navegador/matriz.cjs dist/web/KOFnes.html rom.sfc [saida.json]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
const TELAS = ['home', 'biblioteca', 'estados', 'jukebox', 'estatisticas', 'guia', 'teclas'];
const ACOES = {
  direito: (p) => p.mouse.click(500, 350, { button: 'right' }),
  esc: (p) => p.keyboard.press('Escape'),
  voltar: (p) => p.click('#lateral [data-acao="voltar"]'),
  altEsq: (p) => p.keyboard.press('Alt+ArrowLeft'),
  mouse4: (p) => p.evaluate(() => dispatchEvent(new MouseEvent('mouseup', { button: 3 }))),
  f2: (p) => p.keyboard.press('F2'),
  fora: (p) => p.mouse.click(5, 5),
};
const ver = (p) => p.evaluate((T) => {
  const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
  const k = KOFnes.estado();
  return { tela: T.find(vis) || (vis('temas') ? 'temas' : 'jogo'), rapido: vis('rapido'), pausado: k.pausado, jogo: k.snes };
}, TELAS);
const fmt = (o) => o.tela + (o.rapido ? '+RAPIDO' : '') + (o.jogo ? (o.pausado ? '·pausa' : '·roda') : '');
const irPara = async (p, t) => {   // como o usuário: menu lateral / menu de cima
  if (t === 'home') await p.click('#lateral [data-tela="home"]');
  else if (t === 'teclas' || t === 'estados') await p.evaluate((a) => document.querySelector(`#menu [data-acao="${a}"]`).click(), t);   // sem botão no lateral: menu de cima
  else await p.click(`#lateral [data-tela="${t}"]`);
  await p.waitForTimeout(450);
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const erros = [], matriz = {}, cadeias = {};
  const novo = async (comJogo) => {
    const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); p.setDefaultTimeout(4000);
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto('file://' + html); await p.waitForTimeout(400);
    if (comJogo) {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
      await fc.setFiles(rom); await p.waitForTimeout(1200);
    }
    return p;
  };
  for (const comJogo of [false, true]) {
    for (const t of [...(comJogo ? ['jogo'] : []), ...TELAS]) {
      const linha = matriz[(comJogo ? 'com jogo ' : 'sem jogo ') + t] = {};
      for (const [nome, fazer] of Object.entries(ACOES)) {
        const p = await novo(comJogo);
        if (t !== 'jogo') await irPara(p, t);
        const antes = await ver(p);
        try { await fazer(p); } catch (e) { linha[nome] = 'ERRO ' + e.message.split('\n')[0]; await p.context().close(); continue; }
        await p.waitForTimeout(500);
        const depois = await ver(p);
        linha[nome] = fmt(antes) === fmt(depois) ? '=' : fmt(depois);
        await p.context().close();
      }
    }
  }
  // atalhos do Início: cada botão leva pra tela certa?
  const esperado = { biblioteca: 'biblioteca', jukebox: 'jukebox', estatisticas: 'estatisticas', guia: 'guia' };
  for (const comJogo of [false, true]) {
    for (const [acao, alvo] of Object.entries(esperado)) {
      const p = await novo(comJogo); await irPara(p, 'home');
      await p.click(`#home [data-acao="${acao}"]`); await p.waitForTimeout(600);
      const r = await ver(p); cadeias[(comJogo ? 'com jogo ' : 'sem jogo ') + 'Início→' + acao] = r.tela === alvo ? 'ok' : 'FOI PRA ' + fmt(r);
      await p.context().close();
    }
  }
  // trajetos: onde cada Voltar cai
  for (const comJogo of [false, true]) {
    const p = await novo(comJogo), passos = [];
    for (const t of ['home', 'biblioteca', 'jukebox', 'guia']) { await irPara(p, t); passos.push(t); }
    const volta = [];
    for (let i = 0; i < 5; i++) { await p.click('#lateral [data-acao="voltar"]'); await p.waitForTimeout(500); volta.push(fmt(await ver(p))); }
    cadeias[(comJogo ? 'com jogo ' : 'sem jogo ') + 'ida ' + passos.join('→') + ' | voltas'] = volta.join(' → ');
    await p.context().close();
  }
  await b.close();
  const cols = Object.keys(ACOES), larg = 24;
  console.log('linha'.padEnd(26) + cols.map((c) => c.padEnd(larg)).join(''));
  for (const [l, r] of Object.entries(matriz)) console.log(l.padEnd(26) + cols.map((c) => String(r[c]).padEnd(larg)).join(''));
  console.log(JSON.stringify({ cadeias, erros }, null, 1));
  if (saida) require('fs').writeFileSync(saida, JSON.stringify({ matriz, cadeias, erros }, null, 1));
})();
