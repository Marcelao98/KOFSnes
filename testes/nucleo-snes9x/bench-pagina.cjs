// Abre o KOFnes-bench.html (com o Snes9x embutido), mede o núcleo Kof e o Snes9x na mesma ROM,
// com a CPU "estrangulada" (aproxima celulares mais lentos), e tira um print da imagem do Snes9x.
//   node testes/nucleo-snes9x/bench-pagina.cjs dist/web/KOFnes-bench.html rom.sfc [taxas: 1,4,6] [saida/]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, taxas = '1,4,6', saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const taxa of taxas.split(',').map(Number)) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: taxa });
    await p.goto('file://' + html); await p.waitForTimeout(800);
    await p.setInputFiles('#bench-rom', rom); await p.waitForTimeout(3000);
    await p.click('#bench-medir'); await p.waitForFunction(() => /desenho/.test(document.getElementById('bench-saida').value), null, { timeout: 180000 });
    await p.click('#bench-s9x'); await p.waitForFunction(() => /Snes9x[\s\S]*imagem/.test(document.getElementById('bench-saida').value) || /Erro/.test(document.getElementById('bench-saida').value), null, { timeout: 180000 });
    const t = await p.inputValue('#bench-saida'), g = (re) => (t.match(re) || [])[1];
    const pixels = await p.evaluate(() => { const c = document.getElementById('bench-s9x-tela'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] | d[i + 1] | d[i + 2]) n++; return n; });
    console.log(JSON.stringify({ cpuMaisLenta: taxa + '×', kof: g(/desenho:\s+(\d+ fps \([\d.]+×\))/), snes9x: g(/imagem:\s+(\d+ fps \([\d.]+×\))/), imagemNaoPreta: pixels, erro: /Erro/.test(t) ? t.slice(-120) : null, erros }));
    if (taxa === 1) await p.screenshot({ path: `${saida}/bench-snes9x.png` });
    await ctx.close();
  }
  await b.close();
})();
