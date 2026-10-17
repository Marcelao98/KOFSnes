// Os submenus do menu de cima têm que ficar por cima do menu lateral (nada cortado).
//   node testes/navegador/menu.cjs dist/web/KOFnes.html
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(400);
  for (const nome of ['Arquivo', 'Emulação', 'Imagem', 'Som', 'Ajuda']) {
    await p.click(`#menu .m > button:text-is("${nome}")`); await p.waitForTimeout(150);
    // cada item do submenu aberto: o que está desenhado no centro dele é ele mesmo?
    r[nome] = await p.evaluate(() => {
      const sub = document.querySelector('#menu .m.aberto .sub'); let cobertos = 0, total = 0;
      for (const bt of sub.querySelectorAll('button')) {
        const q = bt.getBoundingClientRect(); if (!q.width) continue; total++;
        const el = document.elementFromPoint(q.left + 6, q.top + q.height / 2);
        if (!bt.contains(el)) cobertos++;
      }
      return { itens: total, cobertos };
    });
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.querySelectorAll('.m.aberto').forEach((m) => m.classList.remove('aberto')));
  }
  console.log(JSON.stringify({ ...r, erros })); await b.close();
})();
