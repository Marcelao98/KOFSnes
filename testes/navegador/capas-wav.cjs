// Capas de GBA e Neo Geo + exportar .wav na jukebox.
// Capas: abre um .gba e um zip de Neo Geo (falso, testes/neogeo/zip-falso.py) e confere pra onde a biblioteca vai buscar a
// capa: GBA no acervo Nintendo_-_Game_Boy_Advance; Neo Geo no FBNeo_-_Arcade_Games pelo nome COMPLETO do jogo (não "mslug").
// As capas são respondidas aqui mesmo (uma imagem de 1 pixel), sem internet.
// .wav: guarda a música de uma ROM de GBA com som (gerada), exporta pelo botão 🎧 da faixa e confere o arquivo (cabeçalho
// RIFF/WAVE, taxa do chip, duração = tempo da faixa + fade, tem som); depois exporta com o Pulso 1 em solo (mudo vale).
//   node testes/navegador/capas-wav.cjs dist/web som.gba neogeo.zip mslug.zip
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [,, pasta, romGba, bios, neo] = process.argv;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const falhas = [];
  const conferir = (ok, msg) => { console.log((ok ? 'ok    ' : 'FALHA ') + msg); if (!ok) falhas.push(msg); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const capas = [];
  await ctx.route(/libretro-thumbnails/, (rt) => { capas.push(decodeURIComponent(rt.request().url())); rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  const p = await ctx.newPage(), erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('file://' + path.resolve(pasta, 'KOFnes.html')); await p.waitForTimeout(800);
  const abrir = async (rom) => { await p.setInputFiles('#arquivo', rom); await p.waitForTimeout(2500); };
  // ---- capas
  await abrir(romGba);
  await abrir(neo);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#bios-tela [data-acao="bios"]')]);
  await fc.setFiles(bios); await p.waitForTimeout(3000);
  await p.evaluate(() => document.querySelector('[data-acao="biblioteca"]').click()); await p.waitForTimeout(2500);
  // no modo lista a capa é buscada pro jogo selecionado: passa a seleção pelos dois
  for (const t of ['ArrowDown', 'ArrowUp']) { await p.keyboard.press(t); await p.waitForTimeout(1200); }
  const gba = capas.find((u) => /Nintendo_-_Game_Boy_Advance\/master\/Named_Boxarts\//.test(u));
  const neogeo = capas.find((u) => /FBNeo_-_Arcade_Games\/master\/Named_Boxarts\/Metal Slug - Super Vehicle-001\.png/.test(u));
  conferir(!!gba, 'capa do GBA buscada no acervo do GBA: ' + (gba || capas.join(' | ')).split('/').slice(-3).join('/'));
  conferir(!!neogeo, 'capa do Neo Geo buscada pelo nome completo no acervo do FBNeo: ' + (neogeo || capas.filter((u) => /FBNeo/.test(u)).join(' | ')).split('/').pop());
  // ---- .wav
  await abrir(romGba);
  await p.keyboard.press('F7'); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-acao="jukebox"]').click()); await p.waitForTimeout(800);
  const wav = async () => {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }),
      p.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].pop().querySelector('button[title^="exportar .wav"]').click())]);
    const buf = require('fs').readFileSync(await d.path());
    const taxa = buf.readUInt32LE(24), dados = buf.readUInt32LE(40), seg = dados / 4 / taxa;
    const pico = (canal) => { let m = 0; for (let i = 44 + canal * 2; i + 1 < buf.length; i += 4 * 64) m = Math.max(m, Math.abs(buf.readInt16LE(i))); return m; };
    return { nome: d.suggestedFilename(), cab: buf.toString('latin1', 0, 4) + '/' + buf.toString('latin1', 8, 12), taxa, seg: Math.round(seg), pico: pico(0) };
  };
  const w = await wav();
  conferir(w.cab === 'RIFF/WAVE' && w.taxa === 65536 && w.seg === 188 && w.pico > 1000 && /\.wav$/.test(w.nome), '.wav do GBA: ' + JSON.stringify(w));
  // solo no Pulso 2 (o Pulso 1 fica mudo) tocando: o .wav sai do jeito que está tocando
  await p.evaluate(() => [...document.querySelectorAll('#jk-lista li.jk-faixa')].pop().click()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('[data-acao="jk-vista-ondas"]').click()); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#jk-ondas .jk-canal:nth-child(3) [data-m="solo"]').click());   // canal "Onda": não toca nada na ROM de teste
  const mudo = await wav();
  conferir(mudo.pico < 300, '.wav com solo num canal calado sai calado (mudo/solo valem): pico ' + mudo.pico);
  conferir(erros.length === 0, 'sem erro na página ' + erros.join(' | '));
  await b.close();
  console.log(falhas.length ? `${falhas.length} falha(s)` : 'tudo certo');
  process.exit(falhas.length ? 1 : 0);
})();
