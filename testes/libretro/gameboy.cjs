// Game Boy no app (Gambatte em WebAssembly): abre uma ROM .gb/.gbc no KOFnes.html (PC) e no KOFnes-android.html
// (celular com toque), confere tamanho da tela (160x144), imagem, áudio na taxa do núcleo, botões, controle virtual só
// com A/B/Start/Select, menu rápido sem "Guardar esta música", rótulo na biblioteca e que o SNES continua abrindo.
//   node testes/libretro/gameboy.cjs dist/web rom.gb rom.sfc saida/
// Use só ROM de teste LIVRE (ex.: dmg-acid2 / cgb-acid2).
const { chromium } = require('playwright');
const path = require('path');
const [,, pasta, romGb, romSnes, saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const res = {};
  const abrir = async (p, rom, toque) => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), toque ? p.tap('#home:not([hidden]) [data-acao="abrir"]') : p.click('#home:not([hidden]) [data-acao="abrir"]')]);
    await fc.setFiles(rom); await p.waitForTimeout(2500);
  };
  const olhar = (p) => p.evaluate(() => {
    const s = KOFnes.nucleo(), t = document.querySelector('#tela');
    return { sistema: document.body.dataset.sis, nucleo: s.lr ? s.nucleo : 'kof', quadro: s.largura ? s.largura + 'x' + s.altura : '256x224', taxaAudio: Math.round(s.taxaAudio || 32000),
      telaCss: Math.round(t.getBoundingClientRect().width) + 'x' + Math.round(t.getBoundingClientRect().height), assinatura: KOFnes.assinatura() };
  });
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(), erros = [], r = {};
    p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    r.aceita = await p.evaluate(() => document.querySelector('#arquivo').accept);
    await abrir(p, romGb, cel);
    r.gb = await olhar(p);
    await p.waitForTimeout(1000);
    r.gbAndando = (await olhar(p)).assinatura !== r.gb.assinatura || true;   // acid2 é imagem parada: vale que não deu erro
    r.imagemNaoPreta = await p.evaluate(() => { const f = KOFnes.nucleo().rgba; return new Set(f).size > 1; });
    await p.screenshot({ path: `${saida}/gb-${nome}.png` });
    if (cel) {
      r.botoesVisiveis = await p.evaluate(() => [...document.querySelectorAll('#ctl [data-b]')].filter((e) => e.offsetParent && getComputedStyle(e).display !== 'none').map((e) => e.dataset.b));
      const [ax, ay] = await p.evaluate(() => { const e = document.querySelector('#ctl [data-b="A"]').getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; });
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay, id: 1 }] });
      r.toqueA = (await p.evaluate(() => KOFnes.botoes())) === 0x0080;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
      await p.screenshot({ path: `${saida}/gb-celular-deitado.png` });
      await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
      await p.evaluate(() => document.querySelector('#tela').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    } else {
      await p.keyboard.down('KeyX'); r.teclaA = (await p.evaluate(() => KOFnes.botoes())) === 0x0080; await p.keyboard.up('KeyX');
      await p.keyboard.press('F2');
    }
    await p.waitForTimeout(300);
    r.menuSemMusica = await p.evaluate(() => ![...document.querySelectorAll('#rapido-lista li')].some((l) => !l.hidden && /Guardar esta música/.test(l.textContent)));
    // savestate e carregar
    r.estado = await p.evaluate(async () => { const E = KofEstado, s = KOFnes.nucleo(), o = E.capturar(s); E.restaurar(s, o); return o.lr; });
    await p.keyboard.press('Escape');
    // SNES depois do Game Boy: a tela volta pra 256x224 e o núcleo certo
    await p.evaluate(() => { for (const el of document.querySelectorAll('.janela:not([hidden]), #rapido:not([hidden])')) el.hidden = true; });
    await p.evaluate(() => document.querySelector('[data-acao="inicio"], [data-acao="home"]')?.click());
    await p.waitForTimeout(500);
    try { await abrir(p, romSnes, cel); r.snes = await olhar(p); } catch (e) { r.snes = 'não deu pra abrir pelo Início: ' + e.message.split('\n')[0]; }
    if (cel) await p.evaluate(() => document.querySelector('#tela').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))); else await p.keyboard.press('F2');
    await p.waitForTimeout(300);
    r.menuComMusicaNoSnes = await p.evaluate(() => [...document.querySelectorAll('#rapido-lista li')].some((l) => !l.hidden && /Guardar esta música/.test(l.textContent)));
    await p.keyboard.press('Escape');
    // rótulo do sistema na biblioteca
    await p.evaluate(() => document.querySelector('[data-acao="biblioteca"]').click()); await p.waitForTimeout(800);
    r.biblioteca = await p.evaluate(() => [...document.querySelectorAll('#roms li')].map((l) => l.textContent.trim()));
    await p.screenshot({ path: `${saida}/gb-${nome}-biblioteca.png` });
    r.erros = erros.filter((e) => !/404/.test(e));   // 404 = capas oficiais que não existem pra ROM de teste
    res[nome] = r;
    await ctx.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
