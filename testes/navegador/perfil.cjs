// Perfil: salvar num .kofperfil, apagar tudo, carregar de volta e conferir que voltou igual.
//   node testes/navegador/perfil.cjs dist/web/KOFnes.html rom.sfc pasta-saida/
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [,, html, rom, saida = '/tmp'] = process.argv;
// resume o que há no banco (contagem + hash do conteúdo) e nas configurações
const resumo = () => (async () => {
  const bd = await new Promise((ok, no) => { const r = indexedDB.open('kofnes'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const hash = async (v) => {
    const b = v instanceof Blob ? await v.arrayBuffer() : new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].slice(0, 6).map((x) => x.toString(16)).join('');
  };
  const out = {};
  for (const l of ['jogos', 'capas', 'stats', 'musicas', 'estados', 'autos', 'roms']) {
    const vs = await new Promise((ok) => { const q = bd.transaction(l).objectStore(l).getAll(); q.onsuccess = () => ok(q.result); });
    const hs = []; for (const v of vs) hs.push(await hash(v.dados || v.estado || v));
    out[l] = { n: vs.length, h: hs.sort().join(',') };
  }
  bd.close();
  const cfg = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== 'kofnes.versaoVista') cfg[k] = localStorage.getItem(k); }
  return { bd: out, cfg };
})();
const apagarTudo = () => new Promise((ok) => { localStorage.clear(); const r = indexedDB.deleteDatabase('kofnes'); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, acceptDownloads: true });
  const p = await ctx.newPage(), erros = [], r = {};
  p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.addInitScript(() => { delete window.showSaveFilePicker; });   // força o caminho do download
  await p.goto('file://' + html); await p.waitForTimeout(400);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#home:not([hidden]) [data-acao="abrir"]')]);
  await fc.setFiles(rom); await p.waitForTimeout(1500);
  await p.keyboard.press('F5'); await p.waitForTimeout(600);       // um savestate de verdade
  await p.keyboard.press('F5'); await p.waitForTimeout(600);
  await p.evaluate(() => { localStorage.setItem('kofnes.volume', '37'); localStorage.setItem('kofnes.tema', 'neon'); });
  await p.click('#lateral [data-tela="perfil"]'); await p.waitForTimeout(300);
  await p.fill('#perfil-nome', 'Marcelo'); await p.click('#perfil-avatares [data-avatar="🐉"]');
  const antes = await p.evaluate(resumo);
  r.estadosAntes = antes.bd.estados.n; r.configAntes = Object.keys(antes.cfg).length;
  // 1) salva com savestates
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-acao="perfil-salvar"]')]);
  const arq = saida + '/teste.kofperfil'; await d.saveAs(arq); r.arquivo = d.suggestedFilename() + ' ' + fs.statSync(arq).size + ' bytes';
  await p.waitForTimeout(300); r.msgSalvar = await p.textContent('#perfil-msg');
  // 2) apaga tudo e recarrega: tem que estar vazio
  await p.evaluate(apagarTudo); await p.reload(); await p.waitForTimeout(600);
  const vazio = await p.evaluate(resumo); r.vazioDepoisDeApagar = vazio.bd.estados.n === 0 && vazio.bd.jogos.n === 0 && !vazio.cfg['kofnes.perfil'];
  // 3) arquivo que não é perfil: erro claro, nada muda
  fs.writeFileSync(saida + '/lixo.kofperfil', 'isso nao e um perfil de verdade, so lixo');
  await p.click('#lateral [data-tela="perfil"]'); await p.setInputFiles('#perfil-arquivo', saida + '/lixo.kofperfil'); await p.waitForTimeout(400);
  r.arquivoRuim = await p.textContent('#perfil-msg');
  // 4) carrega o perfil de verdade (a página recarrega sozinha)
  await Promise.all([p.waitForEvent('load'), p.setInputFiles('#perfil-arquivo', arq)]);
  await p.waitForTimeout(800);
  const depois = await p.evaluate(resumo);
  r.bancoIgual = JSON.stringify(depois.bd) === JSON.stringify({ ...antes.bd, roms: depois.bd.roms });
  r.diferencas = Object.keys(antes.bd).filter((l) => l !== 'roms' && JSON.stringify(antes.bd[l]) !== JSON.stringify(depois.bd[l]));
  const ord = (o) => JSON.stringify(Object.entries(o).sort());
  r.configIgual = ord(depois.cfg) === ord(antes.cfg); if (!r.configIgual) r.cfgDif = { antes: antes.cfg, depois: depois.cfg };
  r.romNaoVoltou = depois.bd.roms.n === 0;
  r.temaVolume = await p.evaluate(() => [KOFnes.tema(), localStorage.getItem('kofnes.volume')]);
  await p.keyboard.press('Home'); await p.waitForTimeout(500);
  r.saudacao = await p.textContent('#hm-saudacao');
  // 5) perfil sem savestates não apaga os que já existem
  await p.click('#lateral [data-tela="perfil"]'); await p.uncheck('#perfil-estados');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('[data-acao="perfil-salvar"]')]);
  const arq2 = saida + '/sem-estados.kofperfil'; await d2.saveAs(arq2); r.tamanhoSemEstados = fs.statSync(arq2).size;
  await Promise.all([p.waitForEvent('load'), p.setInputFiles('#perfil-arquivo', arq2)]); await p.waitForTimeout(800);
  r.estadosSobrevivem = (await p.evaluate(resumo)).bd.estados.n === antes.bd.estados.n;
  console.log(JSON.stringify({ ...r, erros }, null, 1)); await b.close();
})();
