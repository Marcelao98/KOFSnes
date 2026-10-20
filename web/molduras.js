// Molduras do KOFstation: desenhadas aqui em SVG, no tamanho exato da tela (nítidas em qualquer resolução), sem imagem e
// sem marca. Cada moldura diz quanto de borda tem em volta do jogo (frações da altura da tela: cima, direita, baixo,
// esquerda) e desenha o resto em volta do retângulo da tela S = {x, y, w, h}. a = animações ligadas (LED, neon...).
// Cores do tema (moldura "do tema") chegam em t = {fundo, painel, destaque, texto, borda}.
const KofMolduras = (() => {
  'use strict';
  const n2 = (v) => Math.round(v * 10) / 10;
  const R = (x, y, w, h, r, f, ex = '') => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(r)}" fill="${f}" ${ex}/>`;
  const C = (x, y, r, f, ex = '') => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="${f}" ${ex}/>`;
  // texto centralizado; o que vier em "ex" (font-family, font-size...) substitui o padrão (atributo repetido quebra o SVG)
  const T = (x, y, tam, txt, f, ex = '') => `<text x="${n2(x)}" y="${n2(y)}"${/font-size=/.test(ex) ? '' : ` font-size="${n2(tam)}"`} fill="${f}" text-anchor="middle"${/font-family=/.test(ex) ? '' : ' font-family="Arial Black, Impact, sans-serif"'} font-weight="900" ${ex}>${txt}</text>`;
  const L = (id, ...p) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${p.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const LH = (id, ...p) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${p.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const RG = (id, ...p) => `<radialGradient id="${id}">${p.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
  const pisca = (a, dur = '1.4s', v = '1;.15;1') => (a ? `<animate attributeName="opacity" values="${v}" dur="${dur}" repeatCount="indefinite"/>` : '');
  const madeira = (id) => `<pattern id="${id}" width="60" height="14" patternUnits="userSpaceOnUse"><rect width="60" height="14" fill="#6b4020"/><path d="M0 3 Q15 1 30 4 T60 3 M0 9 Q20 7 35 10 T60 9" stroke="#55301a" stroke-width="2" fill="none"/><path d="M0 12 Q25 11 60 13" stroke="#7d4c27" stroke-width="1.2" fill="none"/></pattern>`;
  const grade = (x, y, w, h, passo, cor, larg = 0.45) => { let s = ''; for (let i = x; i < x + w; i += passo) s += R(i, y, passo * larg, h, passo * larg / 2, cor); return s; };
  // vidro escuro em volta da tela (a parte preta do tubo)
  const vidro = (S, m, r, cor = '#0b0b0d') => R(S.x - m, S.y - m, S.w + 2 * m, S.h + 2 * m, r, cor);

  const LISTA = [
    { id: 'tv80', nome: 'TV de madeira (anos 80)', cat: 'TVs', desc: 'caixa de madeira, seletor de canal e botões giratórios', b: [0.1, 0.46, 0.12, 0.1], raio: 0.09,
      d: (W, H, S, a) => { const u = S.h / 100, px = S.x + S.w + 8 * u;
        return `<defs>${madeira('md')}${L('pn', [0, '#3a3128'], [1, '#1e1913'])}${RG('kn', [0, '#f2ead8'], [0.7, '#b9ae96'], [1, '#6d6455'])}</defs>`
          + R(0, 0, W, H, 7 * u, 'url(#md)') + R(2 * u, 2 * u, W - 4 * u, H - 4 * u, 6 * u, 'none', `stroke="#2c180a" stroke-width="${2 * u}"`)
          + vidro(S, 4 * u, 9 * u, '#141210') + R(S.x - 5.5 * u, S.y - 5.5 * u, S.w + 11 * u, S.h + 11 * u, 10 * u, 'none', `stroke="#8c7b5e" stroke-width="${1.2 * u}"`)
          + R(px, S.y, W - px - 6 * u, S.h, 3 * u, 'url(#pn)', `stroke="#1a140e" stroke-width="${u}"`)
          + C(px + (W - px - 6 * u) / 2, S.y + 18 * u, 11 * u, 'url(#kn)') + T(px + (W - px - 6 * u) / 2, S.y + 21 * u, 6 * u, '13', '#3a3128')
          + C(px + (W - px - 6 * u) / 2, S.y + 42 * u, 8 * u, 'url(#kn)')
          + grade(px + 5 * u, S.y + 58 * u, W - px - 16 * u, 26 * u, 3 * u, '#0e0b08')
          + T(px + (W - px - 6 * u) / 2, S.y + 96 * u, 5 * u, 'KOFstation', '#e2b85c', 'font-family="Georgia, serif" font-style="italic"')
          + C(px + 6 * u, S.y + 52 * u, 1.2 * u, '#ff3b30', '') + (a ? `<circle cx="${n2(px + 6 * u)}" cy="${n2(S.y + 52 * u)}" r="${n2(2.4 * u)}" fill="#ff3b3055">${pisca(a, '2s')}</circle>` : ''); } },
    { id: 'tv90', nome: 'TV de tubo (anos 90)', cat: 'TVs', desc: 'plástico preto, alto-falantes embaixo e a luz vermelha', b: [0.08, 0.08, 0.22, 0.08], raio: 0.08,
      d: (W, H, S, a) => { const u = S.h / 100, yb = S.y + S.h + 6 * u;
        return `<defs>${L('pl', [0, '#46464b'], [0.5, '#2a2a2e'], [1, '#18181b'])}</defs>`
          + R(0, 0, W, H, 7 * u, 'url(#pl)') + R(u, u, W - 2 * u, H - 2 * u, 6 * u, 'none', 'stroke="#ffffff14" stroke-width="2"')
          + vidro(S, 3.5 * u, 8 * u)
          + grade(S.x + 4 * u, yb + 2 * u, S.w * 0.28, 8 * u, 2 * u, '#0c0c0d', 0.4) + grade(S.x + S.w * 0.68, yb + 2 * u, S.w * 0.28, 8 * u, 2 * u, '#0c0c0d', 0.4)
          + T(W / 2, yb + 9 * u, 5 * u, 'KOFstation', '#b8b8c0', 'letter-spacing="2"')
          + R(S.x + S.w * 0.36, yb + 12 * u, 4 * u, 2 * u, u, '#111') + R(S.x + S.w * 0.36 + 6 * u, yb + 12 * u, 4 * u, 2 * u, u, '#111')
          + `<circle cx="${n2(S.x + S.w - 2 * u)}" cy="${n2(yb + 13 * u)}" r="${n2(1.3 * u)}" fill="#ff3b30">${pisca(a, '3s', '1;.4;1')}</circle>`; } },
    { id: 'vo', nome: 'TV da vó', cat: 'TVs', desc: 'na estante, com paninho de crochê, bailarina e antena com bombril', b: [0.62, 0.22, 0.44, 0.22], raio: 0.1,
      d: (W, H, S, a) => { const u = S.h / 100, cx = S.x + S.w / 2, topo = S.y - 12 * u, base = S.y + S.h + 14 * u;
        let croche = ''; for (let i = 0; i < 26; i++) { const x = S.x - 8 * u + i * (S.w + 16 * u) / 25; croche += C(x, topo + 1 * u, 3.2 * u, '#f6f1e4', 'stroke="#d8cfb8" stroke-width="0.6"') + C(x, topo + 1 * u, 1 * u, '#e6dcc4'); }
        return `<defs>${L('pa', [0, '#e9dcc7'], [1, '#cdbb9d'])}${madeira('mv')}${L('cx', [0, '#8a7258'], [1, '#5e4a36'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#pa)') + `<path d="M0 ${n2(H * 0.2)} H${W}" stroke="#bfa98a" stroke-width="${u}" opacity=".5"/>`
          + `<path d="M${n2(cx - 6 * u)} ${n2(topo - 2 * u)} L${n2(cx - 34 * u)} ${n2(6 * u)} M${n2(cx + 6 * u)} ${n2(topo - 2 * u)} L${n2(cx + 34 * u)} ${n2(6 * u)}" stroke="#9aa0a6" stroke-width="${1.4 * u}" stroke-linecap="round"/>`
          + C(cx - 34 * u, 6 * u, 3.6 * u, '#c9ccd0', 'stroke="#8d9196" stroke-dasharray="2 1.5" stroke-width="1.5"') + C(cx + 34 * u, 6 * u, 3.6 * u, '#c9ccd0', 'stroke="#8d9196" stroke-dasharray="2 1.5" stroke-width="1.5"')
          + R(cx - 9 * u, topo - 6 * u, 18 * u, 6 * u, 3 * u, '#3b3b3b')
          + R(S.x - 12 * u, topo, S.w + 24 * u, base - topo, 6 * u, 'url(#cx)') + croche
          + vidro(S, 4 * u, 10 * u, '#1a1814')
          + C(S.x + S.w * 0.82, S.y + S.h + 7 * u, 3 * u, '#d8c9a8', 'stroke="#6d5a40" stroke-width="1"') + C(S.x + S.w * 0.9, S.y + S.h + 7 * u, 3 * u, '#d8c9a8', 'stroke="#6d5a40" stroke-width="1"')
          + `<g transform="translate(${n2(S.x + S.w * 0.08)} ${n2(topo - 16 * u)})"><path d="M0 16 L${n2(4 * u)} ${n2(4 * u)} L${n2(8 * u)} 16 Z" fill="#f3b8c8"/>${C(4 * u, 2 * u, 2 * u, '#f6e0c8')}<path d="M${n2(4 * u)} ${n2(4 * u)} L${n2(4 * u)} ${n2(16 * u)}" stroke="#f3b8c8" stroke-width="${n2(1.2 * u)}"/><ellipse cx="${n2(4 * u)}" cy="${n2(12 * u)}" rx="${n2(6 * u)}" ry="${n2(2 * u)}" fill="#f7cad6"/></g>`
          + R(0, base, W, H - base, 0, 'url(#mv)') + R(0, base, W, 2 * u, 0, '#3e2412'); } },
    { id: 'quarto14', nome: 'TV de quarto 14"', cat: 'TVs', desc: 'branquinha em cima da cômoda, com o videogame e o controle com fio', b: [0.12, 0.14, 0.62, 0.14], raio: 0.08,
      d: (W, H, S, a) => { const u = S.h / 100, yb = S.y + S.h + 10 * u, cm = yb + 6 * u;
        return `<defs>${L('br', [0, '#f4f4f0'], [1, '#cfcfc8'])}${L('cm', [0, '#c98f5a'], [1, '#9c6a3f'])}${L('pd', [0, '#cfd9e6'], [1, '#aebccf'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#pd)')
          + R(S.x - 10 * u, S.y - 10 * u, S.w + 20 * u, S.h + 20 * u, 6 * u, 'url(#br)', 'stroke="#b5b5ad" stroke-width="1.5"') + vidro(S, 3 * u, 8 * u, '#202022')
          + C(S.x + S.w + 5 * u, S.y + S.h + 5 * u, 1.3 * u, '#36d36a') + R(S.x + S.w * 0.4, S.y + S.h + 3 * u, S.w * 0.2, 2 * u, u, '#bdbdb5')
          + R(0, cm, W, H - cm, 0, 'url(#cm)') + R(0, cm, W, 2 * u, 0, '#e0aa75')
          + R(S.x + S.w * 0.05, cm + 10 * u, S.w * 0.4, 14 * u, 3 * u, '#2b2b30') + R(S.x + S.w * 0.08, cm + 13 * u, S.w * 0.1, 3 * u, 1.5 * u, '#6d6d76') + C(S.x + S.w * 0.38, cm + 17 * u, 2 * u, '#c33')
          + `<path d="M${n2(S.x + S.w * 0.45)} ${n2(cm + 17 * u)} C${n2(S.x + S.w * 0.6)} ${n2(cm + 35 * u)} ${n2(S.x + S.w * 0.55)} ${n2(cm + 22 * u)} ${n2(S.x + S.w * 0.7)} ${n2(cm + 28 * u)}" stroke="#222" stroke-width="${n2(0.9 * u)}" fill="none"/>`
          + R(S.x + S.w * 0.68, cm + 24 * u, 16 * u, 8 * u, 4 * u, '#3a3a40') + C(S.x + S.w * 0.68 + 4 * u, cm + 28 * u, 1.5 * u, '#888') + C(S.x + S.w * 0.68 + 12 * u, cm + 27 * u, 1.3 * u, '#d33') + C(S.x + S.w * 0.68 + 14.5 * u, cm + 29 * u, 1.3 * u, '#33d'); } },
    { id: 'pilha', nome: 'TV portátil de pilha', cat: 'TVs', desc: 'tela pequena, alça e antena telescópica', b: [0.42, 0.34, 0.3, 0.26], raio: 0.06,
      d: (W, H, S, a) => { const u = S.h / 100, x0 = S.x - 14 * u, y0 = S.y - 14 * u, w0 = S.w + 14 * u + 32 * u, h0 = S.h + 28 * u;
        return `<defs>${L('pt', [0, '#5a5f66'], [1, '#2f3237'])}${L('fd', [0, '#1d2630'], [1, '#0e1218'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#fd)')
          + `<path d="M${n2(x0 + w0 * 0.2)} ${n2(y0)} C${n2(x0 + w0 * 0.2)} ${n2(y0 - 24 * u)} ${n2(x0 + w0 * 0.8)} ${n2(y0 - 24 * u)} ${n2(x0 + w0 * 0.8)} ${n2(y0)}" stroke="#222" stroke-width="${n2(5 * u)}" fill="none"/>`
          + `<path d="M${n2(x0 + w0 - 6 * u)} ${n2(y0)} L${n2(W - 4 * u)} ${n2(3 * u)}" stroke="#c0c4c8" stroke-width="${n2(1.2 * u)}"/>` + C(W - 4 * u, 3 * u, 1.6 * u, '#e0e3e6')
          + R(x0, y0, w0, h0, 6 * u, 'url(#pt)', 'stroke="#1c1e21" stroke-width="2"') + vidro(S, 3 * u, 6 * u, '#0e0f10')
          + grade(S.x + S.w + 6 * u, S.y + 6 * u, 14 * u, S.h * 0.5, 2.2 * u, '#16181b', 0.5)
          + C(S.x + S.w + 13 * u, S.y + S.h * 0.75, 6 * u, '#888c91', 'stroke="#222" stroke-width="1.5"') + T(S.x + S.w + 13 * u, S.y + S.h * 0.75 + 2 * u, 4 * u, 'VHF', '#222')
          + T(S.x + S.w / 2, y0 + h0 - 4 * u, 4.5 * u, 'KOFstation MINI', '#c8ccd0', 'letter-spacing="1"'); } },
    { id: 'fliperama', nome: 'Fliperama de bar', cat: 'Fliperamas', desc: 'letreiro aceso em cima e painel com alavanca e botões', b: [0.32, 0.12, 0.36, 0.12], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, yp = S.y + S.h + 5 * u;
        const bt = (x, y, c) => C(x, y, 4 * u, c, `stroke="#0008" stroke-width="${n2(u)}"`) + C(x - u, y - u, 1.4 * u, '#fff8');
        return `<defs>${LH('lat', [0, '#4a1470'], [0.14, '#16061f'], [0.86, '#16061f'], [1, '#4a1470'])}${L('le', [0, '#ff3ec8'], [0.6, '#7a1fd6'], [1, '#3a0d6b'])}${L('pa', [0, '#2a0f3d'], [1, '#12051c'])}</defs>`
          + R(0, 0, W, H, 3 * u, 'url(#lat)')
          + `<g>${R(S.x - 2 * u, 4 * u, S.w + 4 * u, S.y - 10 * u, 2 * u, 'url(#le)')}${T(W / 2, 4 * u + (S.y - 10 * u) * 0.68, (S.y - 10 * u) * 0.55, 'KOFstation', '#fff', 'style="filter:drop-shadow(0 0 4px #26e0ff)"')}${pisca(a, '2.6s', '1;.8;1;.95;1')}</g>`
          + vidro(S, 2.5 * u, 2 * u, '#000')
          + R(S.x - 6 * u, yp, S.w + 12 * u, H - yp - 4 * u, 3 * u, 'url(#pa)', `stroke="#ff3ec866" stroke-width="${n2(0.8 * u)}"`)
          + C(S.x + S.w * 0.16, yp + 14 * u, 7 * u, '#ff2a2a', `stroke="#7a0000" stroke-width="${n2(1.5 * u)}"`) + R(S.x + S.w * 0.16 - u, yp + 14 * u, 2 * u, 14 * u, u, '#222')
          + bt(S.x + S.w * 0.55, yp + 11 * u, '#26e0ff') + bt(S.x + S.w * 0.67, yp + 11 * u, '#ffe14d') + bt(S.x + S.w * 0.79, yp + 11 * u, '#7dff4f')
          + bt(S.x + S.w * 0.55, yp + 24 * u, '#ff3ec8') + bt(S.x + S.w * 0.67, yp + 24 * u, '#ffffff') + bt(S.x + S.w * 0.79, yp + 24 * u, '#ff8c1a'); } },
    { id: 'shopping', nome: 'Fliperama de shopping', cat: 'Fliperamas', desc: 'de pé, laterais pintadas, neon e a luz da FICHA', b: [0.4, 0.18, 0.62, 0.18], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, yp = S.y + S.h + 5 * u;
        let raios = ''; for (let i = 0; i < 6; i++) raios += `<path d="M0 ${n2(H * (0.15 + i * 0.14))} L${n2(S.x - 4 * u)} ${n2(H * (0.05 + i * 0.14))} M${W} ${n2(H * (0.15 + i * 0.14))} L${n2(S.x + S.w + 4 * u)} ${n2(H * (0.05 + i * 0.14))}" stroke="${['#ffcc00', '#ff3366', '#33ccff'][i % 3]}" stroke-width="${n2(2.4 * u)}"/>`;
        return `<defs>${L('cb', [0, '#101a3a'], [1, '#070b1c'])}${LH('ne', [0, '#00e5ff'], [0.5, '#ff00aa'], [1, '#00e5ff'])}</defs>`
          + R(0, 0, W, H, 2 * u, 'url(#cb)') + raios
          + `<g>${R(S.x - 4 * u, 5 * u, S.w + 8 * u, S.y - 12 * u, 3 * u, '#05060f', `stroke="url(#ne)" stroke-width="${n2(1.6 * u)}"`)}${T(W / 2, 5 * u + (S.y - 12 * u) * 0.7, (S.y - 12 * u) * 0.5, 'SUPER KOF', '#fff', 'style="filter:drop-shadow(0 0 5px #ff00aa)"')}${pisca(a, '1.1s', '1;1;.3;1;1;1;.6;1')}</g>`
          + vidro(S, 3 * u, 2 * u, '#000')
          + R(S.x - 4 * u, yp, S.w + 8 * u, 22 * u, 2 * u, '#1b2550', 'stroke="#33ccff66" stroke-width="1"')
          + C(S.x + S.w * 0.2, yp + 11 * u, 5 * u, '#ffcc00') + C(S.x + S.w * 0.6, yp + 11 * u, 3.6 * u, '#ff3366') + C(S.x + S.w * 0.72, yp + 11 * u, 3.6 * u, '#33ccff') + C(S.x + S.w * 0.84, yp + 11 * u, 3.6 * u, '#7dff4f')
          + R(W / 2 - 16 * u, yp + 30 * u, 32 * u, 26 * u, 2 * u, '#2a2f3a', 'stroke="#555" stroke-width="1.5"')
          + `<g>${R(W / 2 - 11 * u, yp + 34 * u, 22 * u, 8 * u, 1.5 * u, '#ff3b30')}${T(W / 2, yp + 40.5 * u, 6 * u, 'FICHA', '#fff')}${pisca(a, '1.8s', '1;.35;1')}</g>`
          + R(W / 2 - 1.5 * u, yp + 46 * u, 3 * u, 7 * u, 1 * u, '#111'); } },
    { id: 'boteco', nome: 'Mesa de boteco', cat: 'Fliperamas', desc: 'fliperama de mesa visto de cima, com copo americano e coxinha', b: [0.3, 0.5, 0.3, 0.5], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, cx = S.x + S.w + 24 * u, cy = S.y + 26 * u;
        const coxinha = (x, y, r) => `<path d="M${n2(x)} ${n2(y - r)} C${n2(x + r)} ${n2(y)} ${n2(x + r)} ${n2(y + r)} ${n2(x)} ${n2(y + r)} C${n2(x - r)} ${n2(y + r)} ${n2(x - r)} ${n2(y)} ${n2(x)} ${n2(y - r)} Z" fill="#c8812f" stroke="#8a5216" stroke-width="1"/>`;
        return `<defs>${madeira('mb')}${RG('cp', [0, '#fff9'], [0.6, '#e8c56a88'], [1, '#d9a93a'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#mb)') + R(S.x - 10 * u, S.y - 10 * u, S.w + 20 * u, S.h + 20 * u, 4 * u, '#141418', 'stroke="#000" stroke-width="2"')
          + R(S.x - 10 * u, S.y - 10 * u, S.w + 20 * u, S.h + 20 * u, 4 * u, '#ffffff10') + vidro(S, 3 * u, 2 * u, '#000')
          + C(cx, cy, 13 * u, '#e7d9a8', 'stroke="#fff" stroke-width="2"') + C(cx, cy, 11 * u, 'url(#cp)') + C(cx, cy, 13 * u, 'none', 'stroke="#ffffffaa" stroke-width="1" stroke-dasharray="3 3"')
          + C(S.x - 26 * u, S.y + S.h * 0.66, 18 * u, '#f4f4f4', 'stroke="#ccc" stroke-width="1.5"') + coxinha(S.x - 30 * u, S.y + S.h * 0.62, 7 * u) + coxinha(S.x - 20 * u, S.y + S.h * 0.7, 7 * u)
          + R(S.x + S.w + 14 * u, S.y + S.h * 0.6, 20 * u, 26 * u, u, '#ffffff', 'transform="rotate(12 ' + n2(S.x + S.w + 24 * u) + ' ' + n2(S.y + S.h * 0.73) + ')"')
          + C(S.x + S.w * 0.2, S.y + S.h + 18 * u, 4 * u, '#d33') + C(S.x + S.w * 0.8, S.y - 18 * u, 4 * u, '#33d'); } },
    { id: 'tijolao', nome: 'Tijolão verde', cat: 'Portáteis', desc: 'o portátil cinza clássico, tela verde, direcional e A/B', b: [0.24, 0.3, 1.1, 0.3], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, yb = S.y + S.h + 14 * u;
        return `<defs>${L('cz', [0, '#d5d3cc'], [1, '#b8b5ac'])}</defs>`
          + R(0, 0, W, H, 10 * u, 'url(#cz)') + R(0, 0, W, H, 10 * u, 'none', 'stroke="#8e8b82" stroke-width="2"')
          + `<path d="M${n2(S.x - 16 * u)} ${n2(S.y - 12 * u)} H${n2(S.x + S.w + 16 * u)} V${n2(S.y + S.h + 8 * u)} Q${n2(S.x + S.w + 16 * u)} ${n2(S.y + S.h + 14 * u)} ${n2(S.x + S.w + 4 * u)} ${n2(S.y + S.h + 14 * u)} H${n2(S.x - 16 * u)} Z" fill="#5f6268"/>`
          + vidro(S, 2 * u, 0, '#1b2a10') + `<circle cx="${n2(S.x - 9 * u)}" cy="${n2(S.y + S.h * 0.4)}" r="${n2(1.6 * u)}" fill="#e33">${pisca(a, '4s', '1;.6;1')}</circle>`
          + `<text x="${n2(S.x)}" y="${n2(S.y - 4 * u)}" font-size="${n2(3.6 * u)}" fill="#c9c9cf" font-family="Arial, sans-serif" font-style="italic">KOFSTATION · TELA DE PONTOS</text>`
          + `<text x="${n2(S.x - 8 * u)}" y="${n2(yb + 6 * u)}" font-size="${n2(7 * u)}" fill="#2c3a8c" font-family="Arial Black, sans-serif" font-style="italic">KOFstation</text>`
          + R(S.x + 4 * u, yb + 22 * u, 22 * u, 7 * u, 1.5 * u, '#222') + R(S.x + 11.5 * u, yb + 14.5 * u, 7 * u, 22 * u, 1.5 * u, '#222')
          + C(S.x + S.w - 26 * u, yb + 32 * u, 6.5 * u, '#a2185a') + C(S.x + S.w - 10 * u, yb + 24 * u, 6.5 * u, '#a2185a')
          + T(S.x + S.w - 26 * u, yb + 43 * u, 3.6 * u, 'B', '#2c3a8c') + T(S.x + S.w - 10 * u, yb + 35 * u, 3.6 * u, 'A', '#2c3a8c')
          + R(W / 2 - 16 * u, yb + 52 * u, 10 * u, 3 * u, 1.5 * u, '#77757e', `transform="rotate(-25 ${n2(W / 2 - 11 * u)} ${n2(yb + 53 * u)})"`) + R(W / 2 + 2 * u, yb + 52 * u, 10 * u, 3 * u, 1.5 * u, '#77757e', `transform="rotate(-25 ${n2(W / 2 + 7 * u)} ${n2(yb + 53 * u)})"`)
          + Array.from({ length: 6 }, (_, i) => R(S.x + S.w - 26 * u + i * 4 * u, yb + 60 * u, 1.6 * u, 18 * u, 0.8 * u, '#9a978e', `transform="rotate(-25 ${n2(S.x + S.w - 20 * u)} ${n2(yb + 69 * u)})"`)).join(''); } },
    { id: 'roxo', nome: 'Portátil horizontal roxo', cat: 'Portáteis', desc: 'deitado, com L e R em cima', b: [0.26, 0.78, 0.3, 0.78], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, cy = S.y + S.h / 2;
        return `<defs>${L('rx', [0, '#7a63c9'], [1, '#4d3a96'])}</defs>`
          + R(0, 0, W, H, 40 * u, 'url(#rx)') + R(10 * u, -4 * u, 40 * u, 12 * u, 6 * u, '#3d2e78') + R(W - 50 * u, -4 * u, 40 * u, 12 * u, 6 * u, '#3d2e78')
          + R(S.x - 8 * u, S.y - 8 * u, S.w + 16 * u, S.h + 16 * u, 6 * u, '#24243a') + vidro(S, 1.5 * u, 0, '#000')
          + R(22 * u, cy - 4 * u, 26 * u, 8 * u, 2 * u, '#2b2340') + R(31 * u, cy - 13 * u, 8 * u, 26 * u, 2 * u, '#2b2340')
          + C(W - 24 * u, cy - 7 * u, 7 * u, '#d9d4ee') + C(W - 40 * u, cy + 6 * u, 7 * u, '#d9d4ee') + T(W - 24 * u, cy - 4.5 * u, 6 * u, 'A', '#4d3a96') + T(W - 40 * u, cy + 8.5 * u, 6 * u, 'B', '#4d3a96')
          + `<circle cx="${n2(S.x - 4 * u)}" cy="${n2(S.y - 3 * u)}" r="${n2(1.3 * u)}" fill="#6f6">${pisca(a, '5s', '1;.5;1')}</circle>` + T(W / 2, S.y + S.h + 22 * u, 5 * u, 'KOFstation', '#e6e0ff'); } },
    { id: 'translucido', nome: 'Portátil translúcido', cat: 'Portáteis', desc: 'plástico transparente mostrando a placa, a moda de 98', b: [0.24, 0.3, 1.1, 0.3], raio: 0.02,
      d: (W, H, S, a) => { const u = S.h / 100, yb = S.y + S.h + 14 * u;
        let trilhas = ''; for (let i = 0; i < 18; i++) { const y = H * 0.1 + i * H * 0.05, x1 = (i * 37) % 60; trilhas += `<path d="M${n2(x1 * u / 2)} ${n2(y)} h${n2(20 * u)} l${n2(6 * u)} ${n2(6 * u)} h${n2(30 * u)}" stroke="#c9a45a" stroke-width="${n2(0.7 * u)}" fill="none" opacity=".55"/>` + C(x1 * u / 2 + 56 * u, y + 6 * u, 1.2 * u, '#c9a45a', 'opacity=".7"'); }
        return `<defs>${L('tr', [0, '#5b3fa0cc'], [1, '#3b2577dd'])}</defs>`
          + R(0, 0, W, H, 10 * u, '#2a6b3a') + trilhas + R(W * 0.55, H * 0.55, W * 0.3, H * 0.12, u, '#111', 'opacity=".8"')
          + R(0, 0, W, H, 10 * u, 'url(#tr)') + R(0, 0, W, H, 10 * u, 'none', 'stroke="#ffffff55" stroke-width="2"')
          + R(S.x - 16 * u, S.y - 12 * u, S.w + 32 * u, S.h + 26 * u, 4 * u, '#00000088') + vidro(S, 2 * u, 0, '#101010')
          + R(S.x + 4 * u, yb + 22 * u, 22 * u, 7 * u, 1.5 * u, '#1d1630cc') + R(S.x + 11.5 * u, yb + 14.5 * u, 7 * u, 22 * u, 1.5 * u, '#1d1630cc')
          + C(S.x + S.w - 26 * u, yb + 32 * u, 6.5 * u, '#b38cffcc') + C(S.x + S.w - 10 * u, yb + 24 * u, 6.5 * u, '#b38cffcc')
          + `<text x="${n2(S.x - 8 * u)}" y="${n2(yb + 6 * u)}" font-size="${n2(7 * u)}" fill="#fff" font-family="Arial Black, sans-serif" font-style="italic" opacity=".85">KOFstation</text>`; } },
    { id: 'locadora', nome: 'Locadora', cat: 'Bem brasileiro', desc: 'a TV no balcão, prateleira de fitas e o cartaz de LANÇAMENTOS', b: [0.56, 0.55, 0.5, 0.55], raio: 0.06,
      d: (W, H, S, a) => { const u = S.h / 100, cores = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#264653', '#e76f51', '#8338ec', '#3a86ff', '#06d6a0', '#ef476f'];
        let fitas = ''; for (let p = 0; p < 4; p++) { const y = 8 * u + p * (H - 30 * u) / 4; fitas += R(0, y + 20 * u, W, 2.5 * u, 0, '#5c3a1e');
          for (let x = 2 * u, k = p * 3; x < W - 6 * u; x += 5.2 * u, k++) fitas += R(x, y, 4.6 * u, 20 * u, 0.6 * u, cores[k % cores.length]) + R(x + 0.8 * u, y + 3 * u, 3 * u, 6 * u, 0.4 * u, '#fff', 'opacity=".75"'); }
        const yb = S.y + S.h + 12 * u;
        return `<defs>${L('bl', [0, '#b5651d'], [1, '#7b4214'])}</defs>`
          + R(0, 0, W, H, 0, '#3b2a1e') + fitas
          + `<g transform="rotate(-6 ${n2(S.x - 30 * u)} ${n2(S.y + 10 * u)})">${R(S.x - 52 * u, S.y - 2 * u, 42 * u, 22 * u, u, '#ffe600', 'stroke="#d62828" stroke-width="3"')}${T(S.x - 31 * u, S.y + 12.5 * u, 4.6 * u, 'LANÇAMENTOS', '#d62828')}${pisca(a, '2.4s', '1;.85;1')}</g>`
          + R(S.x - 10 * u, S.y - 10 * u, S.w + 20 * u, S.h + 22 * u, 6 * u, '#2a2a2e') + vidro(S, 3 * u, 8 * u)
          + R(0, yb, W, H - yb, 0, 'url(#bl)') + R(0, yb, W, 3 * u, 0, '#d9a066')
          + R(S.x + S.w * 0.1, yb + 10 * u, 20 * u, 12 * u, u, '#111') + R(S.x + S.w * 0.1 + 2 * u, yb + 12 * u, 16 * u, 3 * u, 0.5 * u, '#3a86ff')
          + T(S.x + S.w * 0.75, yb + 20 * u, 6 * u, 'DEVOLVER REBOBINADO', '#fff3', 'font-size="' + n2(4 * u) + '"'); } },
    { id: 'quarto90', nome: 'Quarto anos 90', cat: 'Bem brasileiro', desc: 'TV na estante, pôster na parede, tapete e almofada', b: [0.42, 0.55, 0.5, 0.55], raio: 0.08,
      d: (W, H, S, a) => { const u = S.h / 100, yb = S.y + S.h + 12 * u;
        let pap = ''; for (let x = 0; x < W; x += 14 * u) pap += R(x, 0, 7 * u, yb, 0, '#ffffff10');
        return `<defs>${L('pa', [0, '#3d5a80'], [1, '#2b4162'])}${L('ch', [0, '#a3734a'], [1, '#6e4a2c'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#pa)') + pap
          + `<g transform="rotate(4 ${n2(S.x - 28 * u)} ${n2(S.y + 20 * u)})">${R(S.x - 50 * u, S.y - 6 * u, 36 * u, 50 * u, u, '#111')}${R(S.x - 48 * u, S.y - 4 * u, 32 * u, 46 * u, u, '#e63946')}${C(S.x - 32 * u, S.y + 12 * u, 9 * u, '#ffd166')}${T(S.x - 32 * u, S.y + 36 * u, 6 * u, 'KOF 98', '#fff')}</g>`
          + `<g transform="rotate(-5 ${n2(S.x + S.w + 30 * u)} ${n2(S.y + 20 * u)})">${R(S.x + S.w + 14 * u, S.y - 2 * u, 34 * u, 40 * u, u, '#f1faee')}${R(S.x + S.w + 17 * u, S.y + u, 28 * u, 24 * u, 0, '#2a9d8f')}${T(S.x + S.w + 31 * u, S.y + 33 * u, 4.4 * u, 'PLANETA X', '#1d3557')}</g>`
          + R(S.x - 10 * u, S.y - 10 * u, S.w + 20 * u, S.h + 22 * u, 6 * u, '#1f1f22') + vidro(S, 3 * u, 8 * u)
          + R(0, yb, W, H - yb, 0, 'url(#ch)') + `<ellipse cx="${n2(W / 2)}" cy="${n2(H - 6 * u)}" rx="${n2(W * 0.38)}" ry="${n2(14 * u)}" fill="#c1121f" opacity=".85"/>`
          + `<ellipse cx="${n2(W / 2)}" cy="${n2(H - 6 * u)}" rx="${n2(W * 0.3)}" ry="${n2(10 * u)}" fill="none" stroke="#fdf0d5" stroke-width="${n2(1.2 * u)}" stroke-dasharray="${n2(3 * u)} ${n2(2 * u)}"/>`
          + R(S.x + S.w + 10 * u, H - 22 * u, 26 * u, 16 * u, 7 * u, '#ffb703'); } },
    { id: 'copa', nome: 'Copa do Mundo', cat: 'Bem brasileiro', desc: 'TV enfeitada de bandeirinha, com o placar no canto', b: [0.36, 0.16, 0.26, 0.16], raio: 0.08,
      d: (W, H, S, a) => { const u = S.h / 100;
        let band = ''; const n = 14;
        for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) { const x = i * W / (n - 1), y = 6 * u + k * 14 * u + Math.sin(i / (n - 1) * Math.PI) * 6 * u;
          band += `<path d="M${n2(x - 3 * u)} ${n2(y)} L${n2(x + 3 * u)} ${n2(y)} L${n2(x)} ${n2(y + 8 * u)} Z" fill="${(i + k) % 2 ? '#009c3b' : '#ffdf00'}">${a ? `<animateTransform attributeName="transform" type="rotate" values="-6 ${n2(x)} ${n2(y)};6 ${n2(x)} ${n2(y)};-6 ${n2(x)} ${n2(y)}" dur="${(1.6 + (i % 3) * 0.3).toFixed(1)}s" repeatCount="indefinite"/>` : ''}</path>`; }
        return `<defs>${L('cp', [0, '#1a7f3c'], [1, '#0c4a22'])}</defs>`
          + R(0, 0, W, H, 0, 'url(#cp)') + `<path d="M0 ${n2(6 * u)} Q${n2(W / 2)} ${n2(14 * u)} ${W} ${n2(6 * u)} M0 ${n2(20 * u)} Q${n2(W / 2)} ${n2(28 * u)} ${W} ${n2(20 * u)}" stroke="#fff" stroke-width="1" fill="none"/>` + band
          + R(S.x - 8 * u, S.y - 8 * u, S.w + 16 * u, S.h + 16 * u, 6 * u, '#222226') + vidro(S, 3 * u, 8 * u)
          + R(S.x + S.w - 30 * u, S.y + S.h + 9 * u, 30 * u, 10 * u, 2 * u, '#002776') + T(S.x + S.w - 15 * u, S.y + S.h + 16.5 * u, 6 * u, 'BRA 2 × 0', '#ffdf00')
          + R(S.x, S.y + S.h + 9 * u, 24 * u, 10 * u, 2 * u, '#ffdf00') + T(S.x + 12 * u, S.y + S.h + 16.5 * u, 6 * u, 'É HEXA!', '#009c3b'); } },
    { id: 'tema', nome: 'Moldura do tema', cat: 'Do tema', desc: 'as cores do tema escolhido viram a moldura', b: [0.07, 0.07, 0.07, 0.07], raio: 0.03,
      d: (W, H, S, a, t) => { const u = S.h / 100;
        return `<defs>${L('tm', [0, t.painel], [1, t.fundo])}</defs>`
          + R(0, 0, W, H, 4 * u, 'url(#tm)', `stroke="${t.borda}" stroke-width="${n2(0.8 * u)}"`)
          + `<g>${R(S.x - 2.2 * u, S.y - 2.2 * u, S.w + 4.4 * u, S.h + 4.4 * u, 3 * u, 'none', `stroke="${t.destaque}" stroke-width="${n2(1.2 * u)}" style="filter:drop-shadow(0 0 ${n2(1.5 * u)}px ${t.destaque})"`)}${a ? pisca(a, '3.2s', '1;.6;1') : ''}</g>`
          + vidro(S, 1 * u, 2 * u, '#000'); } },
  ];
  const PADRAO_SIS = { gb: 'tijolao', gba: 'roxo', neogeo: 'fliperama', md: 'tv90', sms: 'tv90', gg: 'pilha', nes: 'quarto14', snes: 'tv90' };
  return { LISTA, PADRAO_SIS };
})();
if (typeof module !== 'undefined') module.exports = KofMolduras;
