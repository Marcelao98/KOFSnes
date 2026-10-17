// teste da versão web: abre o KOFnes.html, carrega a ROM (.zip) pelo
// "Abrir ROM", confere que desenha, aperta Start, mede fps e troca temas
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, saida] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 840, height: 760 } });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await p.goto('file://' + html);
  await p.screenshot({ path: saida + '/0-inicio.png' });
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) .hm-atalhos [data-acao="abrir"], #biblioteca:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom);
  await p.waitForTimeout(15000);
  await p.screenshot({ path: saida + '/1-titulo.png' });
  const fps1 = await p.textContent('#st-fps');
  await p.keyboard.down('Enter'); await p.waitForTimeout(300); await p.keyboard.up('Enter');
  await p.waitForTimeout(4000);
  await p.screenshot({ path: saida + '/2-start.png' });
  for (const t of ['escuro', 'claro', 'zsnes', 'cafe']) {
    await p.click('#menu .m > button:text-is("Tema")');
    await p.click(`.previa[data-tema="${t}"]`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${saida}/tema-${t}.png` });
  }
  console.log(JSON.stringify({ jogo: await p.textContent('#st-jogo'), fps1, fps2: await p.textContent('#st-fps'),
    tema: await p.evaluate(() => document.documentElement.dataset.tema), erros }));
  await b.close();
})();
