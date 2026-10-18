// Contraste (WCAG) dos temas novos (café, jogos, animais e Brasil), direto do estilo.css, e o tema original intacto.
//   node testes/node/contraste.cjs [web/estilo.css]
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', '..', 'web', 'estilo.css'), 'utf8');
const IDS = ['cafe', 'espresso', 'cappuccino', 'latte', 'mocha', 'caramelo', 'coldbrew', 'canela',
  'encanador', 'heroi', 'cacadora', 'corredor', 'blocos', 'arena', 'onca', 'arara', 'capivara', 'gato', 'raposa', 'panda', 'flamingo',
  'carnaval', 'junina', 'litoral', 'sertao', 'amazonia',
  'sessao', 'globinho', 'lanhouse', 'orkutmsn', 'dvdcamelo', 'locadora', 'caderno', 'recreio', 'boteco', 'chuva', 'almoco', 'feira',
  'brasil98', 'hexa2002', 'ferias', 'juninaescola', 'casavo', 'mp3', 'gibi', 'interior'];
const lum = (h) => { const n = h.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
function vars(id) {
  const re = new RegExp(`(?:^|\\n)(?:[^\\n{]*,\\s*)?\\[data-tema="${id}"\\]\\s*\\{([^}]*)\\}`);
  const m = css.match(re); if (!m) throw new Error('tema sem bloco no CSS: ' + id);
  return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
let falhas = 0;
for (const id of IDS) {
  const t = vars(id), btnF = t['botao-fundo'] || t.destaque, btnT = t['botao-texto'] || t.painel;
  const regras = [
    ['texto/fundo', t.texto, t.fundo, 7], ['texto/painel', t.texto, t.painel, 7], ['texto/painel2', t.texto, t.painel2, 7], ['texto/seleção', t.texto, t.sel, 4.5],
    ['apagado/fundo', t.fraco, t.fundo, 4.5], ['apagado/painel', t.fraco, t.painel, 4.5], ['apagado/painel2', t.fraco, t.painel2, 4.5], ['apagado/seleção', t.fraco, t.sel, 3],
    ['destaque/painel', t.destaque, t.painel, 4.5], ['destaque/painel2', t.destaque, t.painel2, 4.5], ['destaque/seleção', t.destaque, t.sel, 3],
    ['botão', btnT, btnF, 4.5], ['borda/painel', t.borda, t.painel, 1.3], ['seleção/painel', t.sel, t.painel, 1.05],
  ];
  const ruins = regras.filter(([, a, b, min]) => razao(a, b) < min).map(([n, a, b, min]) => `${n} ${razao(a, b).toFixed(2)} (<${min})`);
  // o Café queimado é o tema original e fica como está (só avisa o que ficaria abaixo da régua dos novos)
  const orig = id === 'cafe';
  console.log((ruins.length ? (orig ? '⚠ ' : '✖ ') : '✔ ') + id.padEnd(11) + (ruins.length ? ruins.join('; ') : `texto ${razao(t.texto, t.fundo).toFixed(1)}:1 · botão ${razao(btnT, btnF).toFixed(1)}:1`) + (orig && ruins.length ? '  (original, não mexe)' : ''));
  if (!orig) falhas += ruins.length;
}
// o original não mudou: é o padrão de quem já tinha o KOFnes
const o = vars('cafe'); const orig = { fundo: '#1a110b', painel: '#2b1d14', painel2: '#3b2a1e', texto: '#f3e5d0', fraco: '#b89c80', destaque: '#c08552', borda: '#6f4e37', sel: '#6f4e37' };
for (const [k, v] of Object.entries(orig)) if (o[k] !== v) { console.log(`✖ cafe: --${k} mudou (${o[k]} ≠ ${v})`); falhas++; }
console.log(falhas ? `${falhas} problema(s)` : 'tudo certo: contraste ok e Café queimado intacto');
process.exit(falhas ? 1 : 0);
