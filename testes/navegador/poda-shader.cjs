// Poda do shader (visual.js): cada filtro/efeito desenhado com o shader inteiro e com o podado tem de sair igual,
// pixel por pixel (mesma imagem de teste, mesmo tempo). Mostra também o tamanho do shader antes/depois.
//   node testes/navegador/poda-shader.cjs
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const VIS = fs.readFileSync(path.join(__dirname, '../../web/visual.js'), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setContent('<canvas id=c width=512 height=448></canvas>');
  await p.addScriptTag({ content: VIS });
  const r = await p.evaluate(() => {
    const cv = document.getElementById('c'), gl = cv.getContext('webgl', { preserveDrawingBuffer: true });
    const W = 256, H = 224, img = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; img[i] = x; img[i + 1] = y; img[i + 2] = (x ^ y) & 255; img[i + 3] = 255; }
    const texs = [0, 1].map(() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, img); return t; });
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const sh = (tp, src) => { const s = gl.createShader(tp); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const vert = sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }');
    const desenhar = (src, v) => {
      const pr = gl.createProgram(); gl.attachShader(pr, vert); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, src)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texs[1]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texs[0]);
      gl.uniform1i(gl.getUniformLocation(pr, 't'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'tp'), 1);
      gl.uniform4f(gl.getUniformLocation(pr, 'tela'), W, H, cv.width, cv.height);
      gl.uniform4f(gl.getUniformLocation(pr, 'u'), 12.34, 0, 1, 0);
      gl.uniform4fv(gl.getUniformLocation(pr, 'p'), KofVisual.vetor(v));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const o = new Uint8Array(cv.width * cv.height * 4); gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, o); return o;
    };
    // o shader inteiro do jeito de antes (sem poda): as mesmas constantes, sem tirar nada
    const inteiro = (v) => { const podado = KofVisual.fonte(v), defs = podado.match(/^#define [A-Z]\w* .*$/gm).join('\n'); return KofVisual.FRAG.replace(/(^#define [A-Z]\w* .*\n)+/m, defs + '\n'); };
    const res = [];
    for (const [id, , , val] of KofVisual.PREDEF) {
      const v = { ...KofVisual.PADRAO, ...val };
      try {
        const a = desenhar(inteiro(v), v), c = desenhar(KofVisual.fonte(v), v);
        let dif = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - c[i]) > 1) dif++;
        res.push([id, inteiro(v).length, KofVisual.fonte(v).length, dif]);
      } catch (e) { res.push([id, 0, 0, 'ERRO ' + e.message.slice(0, 200)]); }
    }
    return res;
  });
  let falhas = 0;
  for (const [id, a, c, dif] of r) { const ok = dif === 0; if (!ok) falhas++; console.log((ok ? 'ok    ' : 'FALHA ') + id.padEnd(12) + ` ${a} -> ${c} bytes` + (ok ? '' : ` (diferença: ${dif})`)); }
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo');
  await b.close(); process.exit(falhas ? 1 : 0);
})();
