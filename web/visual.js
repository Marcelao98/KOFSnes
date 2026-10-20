// Painel de imagem do KOFstation: um shader só (WebGL 1) com todos os ajustes como parâmetros, mais as predefinições.
// Inspirado nos shaders do RetroArch (sharp-bilinear, ScaleFX/xBR, crt-geom/royale/lottes, blargg NTSC, vhs, lcd-grid,
// gameboy, gba-color, daltonize), mas escrito do zero aqui: nenhuma linha copiada de lá.
// Cada ajuste: [id, grupo, nome, mínimo, máximo, passo, padrão, opções (lista de nomes, quando é escolha)]
const KofVisual = (() => {
  'use strict';
  const AJUSTES = [
    ['pixel', 'Pixels', 'Desenho do pixel', 0, 5, 1, 1, ['Nítido', 'Nítido suave', 'Suave', 'Arredondado (HD)', 'Pintura', 'Desenho animado']],
    ['linhas', 'TV', 'Linhas de varredura', 0, 1, 0.05, 0],
    ['grossas', 'TV', 'Linhas mais grossas no claro', 0, 1, 0.05, 0],
    ['mascara', 'TV', 'Máscara de fósforo', 0, 1, 0.05, 0],
    ['mascaraTipo', 'TV', 'Tipo de máscara', 0, 2, 1, 0, ['Grade (tubo Trinitron)', 'Fenda (TV comum)', 'Pontinhos (monitor)']],
    ['mascaraTam', 'TV', 'Tamanho da máscara', 1, 3, 1, 1],
    ['curva', 'TV', 'Curvatura', 0, 1, 0.05, 0],
    ['cantos', 'TV', 'Cantos arredondados', 0, 1, 0.05, 0],
    ['vinheta', 'TV', 'Vinheta (bordas escuras)', 0, 1, 0.05, 0],
    ['glow', 'TV', 'Brilho que espalha', 0, 1, 0.05, 0],
    ['converg', 'TV', 'Cores desalinhadas', 0, 1, 0.05, 0],
    ['composto', 'Sinal', 'Cabo composto (cor borrada)', 0, 1, 0.05, 0],
    ['vhs', 'Sinal', 'Fita VHS', 0, 1, 0.05, 0],
    ['chiado', 'Sinal', 'Chiado', 0, 1, 0.05, 0],
    ['tremor', 'Sinal', 'Imagem tremendo', 0, 1, 0.05, 0],
    ['rastro', 'Portátil', 'Rastro (tela lenta)', 0, 1, 0.05, 0],
    ['lcd', 'Portátil', 'Grade do LCD', 0, 1, 0.05, 0],
    ['verde', 'Portátil', 'Tela verde (tijolão)', 0, 1, 0.05, 0],
    ['portatil', 'Portátil', 'Cor de tela de portátil', 0, 1, 0.05, 0],
    ['brilho', 'Cor', 'Brilho', -0.3, 0.3, 0.02, 0],
    ['contraste', 'Cor', 'Contraste', 0.5, 1.5, 0.05, 1],
    ['saturacao', 'Cor', 'Saturação', 0, 2, 0.05, 1],
    ['gama', 'Cor', 'Gama', 0.6, 1.6, 0.05, 1],
    ['temperatura', 'Cor', 'Temperatura (frio ↔ quente)', -1, 1, 0.05, 0],
    ['sepia', 'Cor', 'Sépia', 0, 1, 0.05, 0],
    ['pb', 'Cor', 'Preto e branco', 0, 1, 0.05, 0],
    ['dalton', 'Cor', 'Corrigir daltonismo', 0, 3, 1, 0, ['Desligado', 'Protanopia (vermelho)', 'Deuteranopia (verde)', 'Tritanopia (azul)']],
  ];
  const PADRAO = Object.fromEntries(AJUSTES.map((a) => [a[0], a[6]]));
  // predefinições: só o que muda do padrão
  const PREDEF = [
    ['original', 'Original', 'pixel nítido sem tremer, do jeitinho que o console desenha', {}],
    ['nitido', 'Nítido e vivo', 'pixel quadradão com cor forte', { pixel: 0, contraste: 1.15, saturacao: 1.3 }],
    ['suave', 'Suave', 'borrado, cara de emulador antigo', { pixel: 2 }],
    ['tv', 'TV de tubo da sala', 'linhas, fósforo, curva e o cabo composto', { linhas: 0.65, mascara: 0.55, mascaraTipo: 1, mascaraTam: 2, curva: 0.6, cantos: 0.6, vinheta: 0.6, glow: 0.35, composto: 0.6, converg: 0.4 }],
    ['fliperama', 'Monitor de fliperama', 'linhas grossas, cor estourada e brilho', { linhas: 0.95, grossas: 1, mascara: 0.7, mascaraTam: 3, glow: 0.8, curva: 0.35, cantos: 0.4, vinheta: 0.4, saturacao: 1.35, contraste: 1.15 }],
    ['pvm', 'Monitor de estúdio', 'linhas finas e retas, imagem reta e afiada', { linhas: 0.85, grossas: 0.2, mascara: 0.45, contraste: 1.15, saturacao: 1.1 }],
    ['locadora', 'Locadora 1996', 'fita gasta, chiado e cor borrada', { pixel: 2, vhs: 1, chiado: 0.6, composto: 1, saturacao: 0.7, linhas: 0.3, vinheta: 0.45, tremor: 0.5, temperatura: 0.2 }],
    ['vo', 'TV da vó', 'tubo bem curvo, amarelado, antena de bombril', { pixel: 2, curva: 1, cantos: 1, vinheta: 1, sepia: 0.55, tremor: 0.5, chiado: 0.3, linhas: 0.45, composto: 0.6, brilho: -0.05 }],
    ['gameboy', 'Game Boy tijolão', 'tela verde, grade e rastro', { pixel: 0, lcd: 0.9, rastro: 0.6, verde: 1 }],
    ['gbc', 'Portátil colorido', 'grade e as cores lavadas da tela', { pixel: 0, lcd: 0.75, rastro: 0.35, portatil: 1 }],
    ['hd', 'HD de mentirinha', 'contorno arredondado, parece desenho vetorial', { pixel: 3, saturacao: 1.1 }],
    ['pintura', 'Pintura', 'pinceladas, tipo quadro a óleo', { pixel: 4, saturacao: 1.3 }],
    ['cartoon', 'Desenho animado', 'contorno preto e cor chapada', { pixel: 5, saturacao: 1.2 }],
    ['sonho', 'Sonho', 'borrado brilhando, cor de sonho', { pixel: 2, glow: 1, saturacao: 1.6, brilho: 0.1, vinheta: 0.5 }],
    ['cafe', 'Café (sépia)', 'foto antiga', { pixel: 2, sepia: 1, vinheta: 0.7, contraste: 0.9, chiado: 0.15 }],
  ];
  const valores = (id) => { const p = PREDEF.find((x) => x[0] === id); return { ...PADRAO, ...(p ? p[3] : {}) }; };
  // filtros do menu antigo -> predefinição nova (quem já tinha escolhido continua com o parecido)
  const ANTIGO = { crt: 'tv', lcd: 'gbc' };

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D t, tp; uniform vec2 tam, saida; uniform float tempo, divisao; uniform vec4 p[7];
varying vec2 uv;
#define PIXEL p[0].x
#define LINHAS p[0].y
#define GROSSAS p[0].z
#define MASCARA p[0].w
#define MTIPO p[1].x
#define MTAM p[1].y
#define CURVA p[1].z
#define CANTOS p[1].w
#define VINHETA p[2].x
#define GLOW p[2].y
#define CONVERG p[2].z
#define COMPOSTO p[2].w
#define VHS p[3].x
#define CHIADO p[3].y
#define TREMOR p[3].z
#define RASTRO p[3].w
#define LCD p[4].x
#define VERDE p[4].y
#define PORTATIL p[4].z
#define BRILHO p[4].w
#define CONTRASTE p[5].x
#define SATURACAO p[5].y
#define GAMA p[5].z
#define TEMPERATURA p[5].w
#define SEPIA p[6].x
#define PB p[6].y
#define DALTON p[6].z
float luz(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float sorte(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 tx(vec2 c) { return texture2D(t, c).rgb; }
vec3 perto(vec2 c) { return tx((floor(c * tam) + .5) / tam); }
// nítido suave: o pixel fica quadrado, só a costura entre dois pixels é misturada (escala que não é inteira não treme)
vec3 nitidoSuave(vec2 c) {
  vec2 q = c * tam, esc = max(saida / tam, vec2(1.)), f = fract(q) - .5, faixa = .5 - .5 / esc;
  return tx((floor(q) + .5 + (f - clamp(f, -faixa, faixa)) * esc) / tam);
}
bool parece(vec3 a, vec3 b) { return distance(a, b) < .12; }
// arredondado: a regra do Scale2x (EPX) na hora, por quadrante do pixel, com a borda suavizada
vec3 epx(vec2 c) {
  vec2 q = c * tam, f = fract(q), b = (floor(q) + .5) / tam, d = 1. / tam;
  vec3 E = tx(b), B = tx(b - vec2(0., d.y)), D = tx(b - vec2(d.x, 0.)), F = tx(b + vec2(d.x, 0.)), H = tx(b + vec2(0., d.y));
  bool cima = f.y < .5, esq = f.x < .5;
  vec3 v = cima ? B : H, h = esq ? D : F, ov = cima ? H : B, oh = esq ? F : D;
  vec3 r = E;
  if (parece(v, h) && !parece(v, oh) && !parece(h, ov)) {
    vec2 g = abs(f - .5) * 2.;                       // perto do canto: pega a cor do vizinho; no meio: a do pixel
    r = mix(E, h, smoothstep(.4, .9, g.x + g.y));
  }
  return r;
}
vec3 suave(vec2 c) { vec2 d = .8 / tam; return tx(c) * .36 + (tx(c + vec2(d.x, 0.)) + tx(c - vec2(d.x, 0.)) + tx(c + vec2(0., d.y)) + tx(c - vec2(0., d.y))) * .16; }
vec3 hd(vec2 c) { vec2 d = .22 / tam; return (epx(c + d) + epx(c - d) + epx(c + vec2(d.x, -d.y)) + epx(c - vec2(d.x, -d.y))) * .25; }
// pintura: média de uma área (a pincelada) em poucos tons, com o contorno do arredondado por cima
vec3 pintura(vec2 c) {
  vec2 d = 1. / tam; vec3 m = vec3(0.);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) m += tx(c + vec2(float(i), float(j)) * d * .9);
  m /= 9.;
  vec3 e = hd(c);
  return mix(floor(m * 7. + .5) / 7., e, .35);
}
vec3 amostra(vec2 c) {
  if (PIXEL < .5) return perto(c);
  if (PIXEL < 1.5) return nitidoSuave(c);
  if (PIXEL < 2.5) return suave(c);
  if (PIXEL < 3.5) return hd(c);
  if (PIXEL < 4.5) return pintura(c);
  // desenho animado: cores em degraus e contorno preto onde a luz muda de repente
  vec2 d = 1. / tam; vec3 c0 = tx(c);
  float g = abs(luz(tx(c + vec2(d.x, 0.))) - luz(tx(c - vec2(d.x, 0.)))) + abs(luz(tx(c + vec2(0., d.y))) - luz(tx(c - vec2(0., d.y))));
  vec3 deg = floor(c0 * 5. + .5) / 5.;
  return deg * (1. - smoothstep(.18, .4, g));
}
vec3 yiq(vec3 c) { return mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c; }
vec3 rgb(vec3 y) { return mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * y; }
vec3 composto(vec2 c, vec3 base) {
  vec2 d = vec2(1. / tam.x, 0.); vec3 s = yiq(base) * .3;
  float pe = .3;
  for (int k = 1; k <= 3; k++) { float w = .35 / float(k + 1); s.yz += (yiq(tx(c + d * float(k))).yz + yiq(tx(c - d * float(k))).yz) * w; pe += 2. * w; }
  vec3 y = vec3(yiq(base).x, s.yz / pe);
  float faixa = sin((c.x * tam.x + c.y * tam.y) * 3.14159 + tempo * 30.) * length(y.yz) * .3;   // a "listrinha" do composto
  return rgb(y + vec3(faixa, 0., 0.));
}
void main() {
  vec2 c = uv;
  if (divisao > 0. && gl_FragCoord.x < divisao * saida.x) {   // antes | depois: do lado esquerdo, a imagem crua
    vec3 o = nitidoSuave(c);
    if (abs(gl_FragCoord.x - divisao * saida.x) < 1.5) o = vec3(1.);
    gl_FragColor = vec4(o, 1.); return;
  }
  // coordenadas: tremor, fita e curvatura
  if (TREMOR > 0.) { float q = floor(tempo * 30.); c += (vec2(sorte(vec2(q, 1.)), sorte(vec2(q, 2.))) - .5) * TREMOR * vec2(.004, .003); }
  float fx = 0.;
  if (VHS > 0.) {
    float lin = floor(c.y * tam.y), faixaY = fract(tempo * .09);
    float dentro = smoothstep(.06, 0., abs(c.y - faixaY));
    fx = ((sorte(vec2(lin, floor(tempo * 20.))) - .5) * .0025 + dentro * (sorte(vec2(lin, tempo)) - .5) * .03) * VHS;
    c.x += fx;
  }
  if (CURVA > 0.) {
    vec2 q = c * 2. - 1.; vec2 o = abs(q.yx) * CURVA * vec2(.34, .45); q += q * o * o; c = q * .5 + .5;
    if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  }
  // a cor do pixel
  vec3 col;
  if (CONVERG > 0. || VHS > 0.) {
    vec2 o = vec2((CONVERG * 1.8 + VHS * 2.) / tam.x, 0.);
    col = vec3(amostra(c + o).r, amostra(c).g, amostra(c - o).b);
  } else col = amostra(c);
  if (COMPOSTO > 0.) col = mix(col, composto(c, col), COMPOSTO);
  if (VHS > 0.) { col = mix(col, vec3(luz(col)), .25 * VHS); col += (sorte(c * tam + tempo) - .5) * .12 * VHS * smoothstep(.06, 0., abs(c.y - fract(tempo * .09))) * 4.; }
  if (GLOW > 0.) {
    vec2 d = 1.6 / tam; vec3 b = vec3(0.);
    b += tx(c + vec2(d.x, 0.)) + tx(c - vec2(d.x, 0.)) + tx(c + vec2(0., d.y)) + tx(c - vec2(0., d.y));
    b += tx(c + d) + tx(c - d) + tx(c + vec2(d.x, -d.y)) + tx(c - vec2(d.x, -d.y));
    b /= 8.;
    col += b * b * GLOW * 1.3;
  }
  if (RASTRO > 0.) col = mix(col, texture2D(tp, c).rgb, RASTRO * .55);
  // cor
  if (PORTATIL > 0.) {
    vec3 l = pow(col, vec3(2.4));
    l = mat3(.82, .24, -.06, .12, .66, .22, .06, .10, .84) * l;
    col = mix(col, pow(clamp(l, 0., 1.), vec3(1. / 2.)) * .94 + .03, PORTATIL);
  }
  if (VERDE > 0.) col = mix(col, mix(vec3(.06, .22, .06), vec3(.61, .74, .06), smoothstep(0., 1., luz(col))), VERDE);
  col = (col - .5) * CONTRASTE + .5 + BRILHO;
  col = mix(vec3(luz(col)), col, SATURACAO);
  col = pow(clamp(col, 0., 1.), vec3(1. / GAMA));
  col *= vec3(1. + .12 * TEMPERATURA, 1. + .02 * TEMPERATURA, 1. - .12 * TEMPERATURA);
  if (SEPIA > 0.) col = mix(col, vec3(luz(col)) * vec3(1.1, .88, .64), SEPIA);
  if (PB > 0.) col = mix(col, vec3(luz(col)), PB);
  if (DALTON > .5) {   // corrige: o que o olho perde vira diferença nos canais que ele vê
    mat3 m = DALTON < 1.5 ? mat3(.567, .558, 0., .433, .442, .242, 0., 0., .758)
           : DALTON < 2.5 ? mat3(.625, .7, 0., .375, .3, .3, 0., 0., .7)
                          : mat3(.95, 0., 0., .05, .433, .475, 0., .567, .525);
    vec3 e = col - m * col;
    col += vec3(0., .7 * e.r + e.g, .7 * e.r + e.b);
  }
  // a tela: linhas, grade do LCD, máscara
  if (LINHAS > 0.) {
    float y = c.y * tam.y, s = .5 + .5 * cos(6.28318 * (fract(y) - .5));
    s = pow(s, mix(1.2, .35, luz(col) * GROSSAS));
    col *= mix(1., s, LINHAS * .85) * (1. + LINHAS * .32);
  }
  if (LCD > 0.) { vec2 f = fract(c * tam); float g = smoothstep(0., .14, f.x) * smoothstep(0., .14, f.y) * smoothstep(1., .9, f.x) * smoothstep(1., .9, f.y); col *= mix(1., .2 + .8 * g, LCD) * (1. + LCD * .2); }
  if (MASCARA > 0.) {
    vec2 fc = floor(gl_FragCoord.xy / MTAM);
    float col3 = mod(fc.x, 3.);
    if (MTIPO > 1.5) col3 = mod(fc.x + mod(fc.y, 2.) * 1.5, 3.);                      // pontinhos: fileiras desencontradas
    vec3 m = col3 < 1. ? vec3(1., .3, .3) : col3 < 2. ? vec3(.3, 1., .3) : vec3(.3, .3, 1.);
    if (MTIPO > .5 && MTIPO < 1.5 && mod(fc.y + floor(fc.x / 3.) * 2., 4.) < 1.) m *= .5;   // fenda: a TV comum
    col *= mix(vec3(1.), m * 1.55, MASCARA * .7);
  }
  if (VINHETA > 0.) { vec2 v = c * (1. - c.yx); col *= pow(clamp(v.x * v.y * 15., 0., 1.), VINHETA * 1.1); }
  if (CANTOS > 0.) { vec2 q = abs(c - .5) * 2.; vec2 k = max(q - (1. - CANTOS * .12), 0.) / (CANTOS * .12 + .0001); col *= smoothstep(1., .85, length(k)); }
  if (CHIADO > 0.) col += (sorte(gl_FragCoord.xy + fract(tempo) * 100.) - .5) * CHIADO * .4;
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;
  // os valores na ordem do shader (vec4 p[7])
  const ORDEM = ['pixel', 'linhas', 'grossas', 'mascara', 'mascaraTipo', 'mascaraTam', 'curva', 'cantos', 'vinheta', 'glow', 'converg',
    'composto', 'vhs', 'chiado', 'tremor', 'rastro', 'lcd', 'verde', 'portatil', 'brilho', 'contraste', 'saturacao', 'gama', 'temperatura',
    'sepia', 'pb', 'dalton'];
  const vetor = (v) => { const a = new Float32Array(28); ORDEM.forEach((k, i) => { a[i] = v[k] !== undefined ? +v[k] : PADRAO[k]; }); return a; };
  const animado = (v) => v.vhs > 0 || v.chiado > 0 || v.tremor > 0 || v.composto > 0;
  return { AJUSTES, PADRAO, PREDEF, ANTIGO, FRAG, valores, vetor, animado };
})();
if (typeof module !== 'undefined') module.exports = KofVisual;
