const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const ini = html.indexOf('const KofNucleo = '), fim = html.indexOf('</script>', ini);
const ctx = { console, Math, performance }; vm.createContext(ctx);
vm.runInContext(html.slice(ini, fim) + '\nthis.KofNucleo = KofNucleo;', ctx);
// cartucho HiROM de 1 MB com 2 KB de SRAM (como o Donkey Kong Country)
const r = new Int32Array(0x100000), h = 0xFFC0;
'TESTE HIROM SRAM     '.split('').forEach((c, i) => { r[h + i] = c.charCodeAt(0); });
r[h + 0x15] = 0x31; r[h + 0x16] = 0x02; r[h + 0x17] = 0x0A; r[h + 0x18] = 0x01; r[h + 0x19] = 0x01;
r[h + 0x1C] = 0xFF; r[h + 0x1D] = 0xFF; r[h + 0x1E] = 0; r[h + 0x1F] = 0;
r[0xFFFC] = 0x00; r[0xFFFD] = 0x80; r[0x8000] = 0x78; r[0x8001] = 0x80; r[0x8002] = 0xFE;   // SEI; BRA -2
const s = new ctx.KofNucleo.Snes(r); s.reset();
const res = { mapper: s.cart.mapper, temSram: s.cart.hasSram(), tamanho: s.cart.sram.length };
s.write(0x306000, 0x55); s.write(0xB07FFF, 0xAA);
res.le306000 = s.read(0x306000).toString(16);
res.espelho306800 = s.read(0x306800).toString(16);     // 2 KB depois: mesmo byte
res.bancoA0 = s.read(0xA06000).toString(16);           // outro banco, mesmo save
res.fim = s.read(0x3067FF).toString(16);
res.wram0000 = (s.write(0x000010, 0x12), s.read(0x7E0010).toString(16));
console.log(res);
