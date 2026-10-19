// Jukebox com Game Boy e osciloscópio: no KOFnes.html (PC) e no KOFnes-android.html (celular) guarda a música de um
// jogo de Game Boy e de um de SNES, toca as duas na jukebox, confere que o áudio sai, que as barras têm 4 e 8 canais,
// liga o modo Ondas (prints em 3 temas), testa Mudo e Solo e que a escolha do modo fica guardada.
//   node testes/libretro/jukebox.cjs dist/web rom.gb rom.sfc saida/
// Use só ROM de teste LIVRE (uma de Game Boy que toque som e uma de SNES com música, ex.: FFVIIPrelude).
const { chromium } = require('playwright');
const path = require('path');
const [,, pasta, romGb, romSnes, saida = '/tmp'] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const res = {};
  for (const [nome, arq, cel] of [['pc', 'KOFnes.html', false], ['celular', 'KOFnes-android.html', true]]) {
    const ctx = await b.newContext(cel ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage(), erros = [], r = {};
    p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) erros.push(m.text()); });
    await p.goto('file://' + path.resolve(pasta, arq)); await p.waitForTimeout(800);
    const clicar = (sel) => p.evaluate((q) => document.querySelector(q).click(), sel);
    const abrirRom = async (rom) => {
      await p.evaluate(() => { for (const el of document.querySelectorAll('.janela:not([hidden])')) el.hidden = true; });
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), clicar('#arquivo')]);
      await fc.setFiles(rom); await p.waitForTimeout(2500);
    };
    // guarda a música dos dois jogos
    for (const rom of [romGb, romSnes]) { await abrirRom(rom); await clicar('[data-acao="guardar-musica"]'); await p.waitForTimeout(600); }
    await clicar('[data-acao="jukebox"]'); await p.waitForTimeout(600);
    r.faixas = await p.evaluate(() => [...document.querySelectorAll('#jk-lista li')].map((l) => l.textContent.replace(/[✎⬇🗑]/g, '').trim()));
    r.exportarSoNoSnes = await p.evaluate(() => [...document.querySelectorAll('#jk-lista .jk-faixa')].map((l) => !!l.querySelector('[title="exportar .spc"]')));
    const tocarFaixa = async (texto) => {
      await p.evaluate((t) => [...document.querySelectorAll('#jk-lista .jk-grupo')].find((l) => l.textContent.includes(t)).nextElementSibling.click(), texto);
      await p.waitForTimeout(1500);
    };
    const olhar = () => p.evaluate(() => ({ juke: KOFnes.juke(), barras: document.querySelectorAll('#jk-vozes .jk-voz').length, faixasOnda: document.querySelectorAll('#jk-ondas .jk-canal').length,
      dica: document.querySelector('#jk-vozes-dica').textContent.trim().slice(0, 40), nomes: [...document.querySelectorAll('#jk-vozes .jk-voz span')].map((s) => s.textContent) }));
    for (const [sis, rom] of [['gb', romGb], ['snes', romSnes]]) {
      const jogo = path.basename(rom).replace(/\.[^.]+$/, '');
      await tocarFaixa(jogo);
      const a = await olhar(); await p.waitForTimeout(1000); const d = await olhar();
      r[sis] = { tocando: d.juke.tocando, amostrasAndando: d.juke.amostras > a.juke.amostras, barras: d.barras, nomes: d.nomes, dica: d.dica, faixasOnda: d.faixasOnda };
      // barras (modo Capa) mexem?
      r[sis].barraMexe = await p.evaluate(() => [...document.querySelectorAll('#jk-vozes .jk-voz i')].some((i) => parseFloat(i.style.height) > 0));
      await p.screenshot({ path: `${saida}/jk-${nome}-${sis}-capa.png` });
      await clicar('[data-acao="jk-vista-ondas"]'); await p.waitForTimeout(700);
      // o canvas tem desenho (algum pixel não transparente além da linha do zero)
      r[sis].ondaDesenhada = await p.evaluate(() => [...document.querySelectorAll('#jk-ondas canvas')].some((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) n++; return n > c.width / 2; }));
      await p.screenshot({ path: `${saida}/jk-${nome}-${sis}-ondas.png` });
      // Solo no canal 1 e Mudo no 2
      await clicar('#jk-ondas .jk-canal:nth-child(1) [data-m="solo"]'); r[sis].soloMascara = (await olhar()).juke.efetivas;
      await clicar('#jk-ondas .jk-canal:nth-child(1) [data-m="solo"]');
      await clicar('#jk-ondas .jk-canal:nth-child(2) [data-m="mudo"]'); r[sis].mudoMascara = (await olhar()).juke.efetivas;
      await clicar('#jk-ondas .jk-canal:nth-child(2) [data-m="mudo"]');
      await clicar('[data-acao="jk-vista-capa"]');
    }
    // temas: o estilo muda com o tema
    await clicar('[data-acao="jk-vista-ondas"]');
    for (const t of ['neon', 'portatil', 'latte']) {
      await p.evaluate((x) => KOFnes.mudarTema(x), t);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${saida}/jk-${nome}-tema-${t}.png` });
    }
    r.vistaGuardada = await p.evaluate(() => localStorage.getItem('kofnes.jkVista'));
    r.erros = erros;
    res[nome] = r;
    await ctx.close();
  }
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch((e) => { console.log('ERRO', e); process.exit(1); });
