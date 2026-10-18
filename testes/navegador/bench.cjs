// Teste de desempenho do KOFnes-bench.html com a CPU "estrangulada" (aproxima celulares mais fracos).
//   node testes/navegador/bench.cjs dist/web/KOFnes-bench.html rom.sfc [taxas: 1,4,6]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [,, html, rom, taxas = '1,4,6'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const taxa of taxas.split(',').map(Number)) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 800 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(), erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: taxa });
    await p.goto('file://' + html); await p.waitForTimeout(600);
    await p.setInputFiles('#bench-rom', rom); await p.waitForTimeout(3000);
    const painel = await p.isVisible('#bench');
    await p.click('#bench-medir');
    await p.waitForFunction(() => /desenho/.test(document.getElementById('bench-saida').value), null, { timeout: 120000 });
    const t = await p.inputValue('#bench-saida');
    const g = (re) => (t.match(re) || [])[1];
    console.log(JSON.stringify({ cpuMaisLenta: taxa + '×', painel, soNucleo: g(/Só emulação:\s+(\d+ fps \([\d.]+×\))/), comDesenho: g(/desenho:\s+(\d+ fps \([\d.]+×\))/), veredito: g(/\n(ÓTIMO|BOM|NO LIMITE|FRACO)/), erros }));
    await ctx.close();
  }
  await b.close();
})();
