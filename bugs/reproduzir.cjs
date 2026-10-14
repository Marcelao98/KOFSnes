// Reproduz um pacote de bug do KOFnes (kofbug-*.json.gz, do modo caçador de bugs):
// restaura o estado de segundos antes do bug e aperta os mesmos botões, quadro
// a quadro. Se chegar na mesma imagem do pacote, o bug está reproduzido.
//   node bugs/reproduzir.cjs dist/web/KOFnes.html kofbug-....json.gz minha-rom.sfc
// A ROM não vem no pacote: use a sua (o SHA-1 confere se é a mesma).
const fs = require('fs'), vm = require('vm'), zlib = require('zlib');
const [,, htmlArq, pacArq, romArq] = process.argv;
const html = fs.readFileSync(htmlArq, 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
const E = require(require('path').join(__dirname, '..', 'web', 'estado.js'));
const pac = JSON.parse(zlib.gunzipSync(fs.readFileSync(pacArq)).toString());
const rom = fs.readFileSync(romArq);
const sha = require('crypto').createHash('sha1').update(rom).digest('hex');
console.log('ROM confere com o pacote:', sha === pac.jogo.sha1);
const s = new ctx.KofNucleo.Snes(Int32Array.from(rom)); s.reset();
E.restaurar(s, pac.replay.estado);
const ent = new Uint16Array(Uint8Array.from(Buffer.from(pac.replay.entradas, 'base64')).buffer);
for (const b of ent) { s.pad[0] = b; s.runFrame(); s.apu.dsp.outCount = 0; }
let t = 0; const f = s.ppu.frame; for (let p = 0; p < 57344; p++) t = (Math.imul(t, 31) + (f[p] & 0xFFFFFF)) & 0x7FFFFFFF;
const ass = t + ':' + s.cpu.pc;
console.log('quadros reproduzidos:', ent.length, '| assinatura do replay:', ass, '| do pacote:', pac.agora.assinatura, '| IGUAL:', ass === pac.agora.assinatura);
