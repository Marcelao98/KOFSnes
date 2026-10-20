"""Gera o guia dos temas do KOFstation (uma página só, pra postar e pra galera copiar as cores).

Lê a lista de temas (TEMAS no web/app.js, com categoria, nome e descrição) e as cores de cada um (os blocos
[data-tema="id"] do web/estilo.css) e escreve:
  docs/guia-de-temas.html        página completa (abre direto no navegador)
  <saída>/guia-de-temas-artefato.html  só o conteúdo (pra publicar como página), se passar uma pasta
Uso: python3 docs/gerar-guia-temas.py [pasta-do-artefato]
"""
import html
import json
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
app = (RAIZ / 'web' / 'app.js').read_text()
css = re.sub(r'/\*.*?\*/', '', (RAIZ / 'web' / 'estilo.css').read_text(), flags=re.S)   # comentário grudaria no seletor

# TEMAS é um literal JS: o Node avalia e devolve em JSON
ini = app.index('const TEMAS = [')
fim = app.index('\n];', ini) + 3
temas = json.loads(subprocess.run(['node', '-e', app[ini:fim].replace('const TEMAS =', 'const T =') + ';console.log(JSON.stringify(T))'],
                                  capture_output=True, text=True, check=True).stdout)

# variáveis de cada tema: junta as declarações --x dos blocos cujo seletor cita [data-tema="id"] (o 1º bloco é o do tema)
VARS = ['fundo', 'painel', 'painel2', 'texto', 'fraco', 'destaque', 'borda', 'sel', 'tela-borda', 'fundo-img', 'fonte', 'raio',
        'botao-fundo', 'botao-texto']
blocos = re.findall(r'([^{}]+)\{([^{}]*)\}', css)
def cores(id_):
    v = {}
    for sel, corpo in blocos:
        # só o bloco do próprio tema (não regras de dentro dele, tipo [data-tema="x"] .janela)
        if not any(p.strip() in (f'[data-tema="{id_}"]', f':root[data-tema="{id_}"]', f'html[data-tema="{id_}"]') for p in sel.split(',')):
            continue
        for k, val in re.findall(r'--([a-z0-9-]+)\s*:\s*([^;]+);', corpo):
            v.setdefault(k, val.strip())
    return v
base = cores('cafe')

itens, total = [], 0
for cat, lista in temas:
    cards = []
    for t in lista:
        id_, nome = t[0], t[1]
        desc = t[2] if len(t) > 2 else ''
        v = {**base, **cores(id_)}
        total += 1
        estilo = ';'.join(f'--t-{k}:{v[k]}' for k in VARS if k in v)
        bloco = f'[data-tema="{id_}"] {{\n' + ''.join(f'  --{k}: {v[k]};\n' for k in VARS if k in v and k not in ('fonte',)) + '}'
        amostras = ''.join(
            f'<button class="cor" style="--c:{html.escape(v[k])}" data-copiar="{html.escape(v[k])}" title="copiar {k}: {html.escape(v[k])}">'
            f'<span class="bola"></span><span class="rot">{k}</span><code>{html.escape(v[k])}</code></button>'
            for k in ('fundo', 'painel', 'painel2', 'texto', 'destaque', 'borda') if k in v)
        busca = html.escape(f'{nome} {cat} {id_} {desc}'.lower())
        cards.append(f'''<article class="tema" data-cat="{html.escape(cat)}" data-busca="{busca}">
  <div class="mini" style="{html.escape(estilo)}" aria-hidden="true">
    <div class="mini-menu"><span>Arquivo</span><span>Imagem</span><span>Tema</span></div>
    <div class="mini-palco"><div class="mini-janela"><b>{html.escape(nome)}</b><small>{html.escape(desc or cat)}</small>
      <div class="mini-linha"><span class="mini-tela"></span><span class="mini-botao">▶ Jogar</span></div></div></div>
  </div>
  <div class="tema-info"><h3>{html.escape(nome)}</h3><p class="id">data-tema="{id_}"</p>{f'<p class="desc">{html.escape(desc)}</p>' if desc else ''}</div>
  <div class="cores">{amostras}</div>
  <button class="copiar-css" data-copiar="{html.escape(bloco)}">Copiar o CSS do tema</button>
</article>''')
    itens.append((cat, len(lista), '\n'.join(cards)))

chips = ''.join(f'<button class="chip" data-filtro="{html.escape(c)}">{html.escape(c)} <span>{n}</span></button>' for c, n, _ in itens)
secoes = '\n'.join(f'<section class="grupo" data-grupo="{html.escape(c)}"><h2>{html.escape(c)} <span>{n} temas</span></h2><div class="grade">{cards}</div></section>'
                   for c, n, cards in itens)

conteudo = f'''<title>Temas do KOFstation</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* Layout: um balcão de café com fichas de amostra; cabeçalho curto, filtros grudados no topo, grade de fichas por categoria */
:root {{
  --bg: #1a110b; --superficie: #2b1d14; --superficie2: #3b2a1e; --tinta: #f3e5d0; --apagado: #b89c80; --caramelo: #c08552; --linha: #6f4e37;
  --f-titulo: "Bungee", "Arial Black", Impact, sans-serif; --f-texto: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --f-codigo: "IBM Plex Mono", ui-monospace, Consolas, monospace;
  color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
body {{ background: var(--bg); color: var(--tinta); font: 15px/1.55 var(--f-texto); }}
body::before {{ content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }}
.miolo {{ max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }}
header.topo {{ padding-block: 48px 28px; display: grid; gap: 14px; }}
.selo {{ font: 600 12px var(--f-codigo); letter-spacing: .14em; text-transform: uppercase; color: var(--caramelo); }}
h1 {{ font: 400 clamp(34px, 7vw, 68px)/1 var(--f-titulo); margin: 0; text-wrap: balance; }}
h1 em {{ font-style: normal; color: var(--caramelo); }}
.lead {{ max-width: 62ch; color: var(--apagado); font-size: 17px; margin: 0; }}
.lead b {{ color: var(--tinta); }}
.como {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 8px; }}
.como div {{ background: var(--superficie); border: 1px solid var(--linha); border-radius: 8px; padding: 12px 14px; font-size: 13.5px; color: var(--apagado); min-width: 0; }}
.como code {{ font: 12.5px var(--f-codigo); color: var(--tinta); }}
.filtros {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px);
  border-block: 1px solid var(--linha); padding-block: 12px; }}
.filtros .miolo {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
#busca {{ flex: 1 1 220px; min-width: 0; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--linha); background: var(--superficie); color: var(--tinta); font: inherit; }}
.chip {{ border: 1px solid var(--linha); background: var(--superficie); color: var(--tinta); border-radius: 99px; padding: 6px 12px; font: 13px var(--f-texto); cursor: pointer; }}
.chip span {{ color: var(--apagado); font-family: var(--f-codigo); font-size: 12px; }}
.chip.ativo {{ background: var(--caramelo); border-color: var(--caramelo); color: var(--bg); }}
.chip.ativo span {{ color: var(--bg); }}
#contagem {{ font: 13px var(--f-codigo); color: var(--apagado); }}
.grupo {{ padding-block: 28px 8px; }}
.grupo h2 {{ font: 400 22px var(--f-titulo); margin: 0 0 14px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }}
.grupo h2 span {{ font: 13px var(--f-codigo); color: var(--apagado); }}
.grade {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }}
.tema {{ background: var(--superficie); border: 1px solid var(--linha); border-radius: 10px; padding: 10px; display: grid; gap: 10px; align-content: start; min-width: 0; }}
.mini {{ border-radius: 7px; overflow: hidden; border: 1px solid rgba(0,0,0,.35); background: var(--t-fundo); font-family: var(--t-fonte, var(--f-texto)); }}
.mini-menu {{ display: flex; gap: 12px; padding: 5px 9px; background: var(--t-painel); color: var(--t-texto); font-size: 11px; border-bottom: 1px solid var(--t-borda); }}
.mini-palco {{ padding: 16px 14px; background: var(--t-fundo-img, none), var(--t-fundo); background-size: cover; }}
.mini-janela {{ background: var(--t-painel2); color: var(--t-texto); border: 1px solid var(--t-borda); border-radius: var(--t-raio, 8px); padding: 10px 12px; display: grid; gap: 4px; }}
.mini-janela b {{ font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.mini-janela small {{ color: var(--t-fraco); font-size: 11.5px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6em; }}
.mini-linha {{ display: flex; gap: 8px; align-items: center; margin-top: 6px; }}
.mini-tela {{ flex: 1; height: 26px; border-radius: 3px; border: 2px solid var(--t-tela-borda, var(--t-borda)); background: repeating-linear-gradient(0deg, #0004 0 2px, transparent 2px 4px), linear-gradient(135deg, var(--t-destaque), var(--t-fundo)); }}
.mini-botao {{ background: var(--t-botao-fundo, var(--t-destaque)); color: var(--t-botao-texto, var(--t-painel)); border-radius: var(--t-raio, 8px); padding: 5px 10px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }}
.tema-info h3 {{ margin: 0; font-size: 15px; }}
.tema-info .id {{ margin: 0; font: 12px var(--f-codigo); color: var(--apagado); }}
.tema-info .desc {{ margin: 4px 0 0; font-size: 13px; color: var(--apagado); }}
.cores {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }}
.cor {{ display: grid; grid-template-columns: 16px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 6px; align-items: center; text-align: left;
  background: var(--superficie2); border: 1px solid transparent; border-radius: 6px; padding: 5px 6px; color: var(--tinta); cursor: pointer; font: inherit; min-width: 0; }}
.cor:hover {{ border-color: var(--caramelo); }}
.cor .bola {{ grid-row: 1 / 3; width: 16px; height: 16px; border-radius: 50%; background: var(--c); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }}
.cor .rot {{ font-size: 10.5px; color: var(--apagado); text-transform: uppercase; letter-spacing: .06em; }}
.cor code {{ font: 11px var(--f-codigo); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.copiar-css {{ border: 1px dashed var(--linha); background: none; color: var(--tinta); border-radius: 8px; padding: 8px; font: 600 13px var(--f-texto); cursor: pointer; }}
.copiar-css:hover {{ border-color: var(--caramelo); color: var(--caramelo); }}
button:focus-visible, input:focus-visible {{ outline: 2px solid var(--caramelo); outline-offset: 2px; }}
#aviso {{ position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--caramelo); color: var(--bg);
  padding: 8px 16px; border-radius: 99px; font: 600 13px var(--f-texto); opacity: 0; transition: opacity .2s; pointer-events: none; }}
#aviso.mostra {{ opacity: 1; }}
#copia-manual {{ position: fixed; left: -9999px; }}
footer {{ padding-block: 40px 56px; color: var(--apagado); font-size: 13.5px; border-top: 1px solid var(--linha); margin-top: 32px; }}
footer a {{ color: var(--caramelo); }}
@media (prefers-reduced-motion: reduce) {{ #aviso {{ transition: none; }} }}
</style>

<header class="miolo topo">
  <span class="selo">KOFstation · emulador brasileiro de videogame retrô</span>
  <h1>{total} temas pra você <em>roubar</em></h1>
  <p class="lead">Todos os temas do KOFstation num lugar só, com as cores de verdade. <b>Pode copiar à vontade</b>: clique numa cor pra copiar o código, ou no botão de cada ficha pra levar o tema inteiro em CSS.</p>
  <div class="como">
    <div><code>--fundo</code> e <code>--painel</code>: o fundo da janela e das barras. <code>--painel2</code> é a caixa por cima.</div>
    <div><code>--texto</code> e <code>--fraco</code>: o texto principal e o texto de apoio.</div>
    <div><code>--destaque</code>: botões, item escolhido, foco. <code>--borda</code> e <code>--sel</code>: contornos e seleção.</div>
  </div>
</header>

<nav class="filtros" aria-label="filtrar temas"><div class="miolo">
  <input id="busca" type="search" placeholder="buscar por nome, categoria ou cor (ex.: café, anime, verde)" autocomplete="off">
  <button class="chip ativo" data-filtro="">Todos <span>{total}</span></button>{chips}
  <span id="contagem"></span>
</div></nav>

<main class="miolo">
{secoes}
</main>

<footer class="miolo">
  Feito pro <b>KOFstation</b>: Super Nintendo, NES, Game Boy, GBA, Sega, Neo Geo e PlayStation num lugar só.
  Código em <a href="https://github.com/Marcelao98/KOFSnes" target="_blank" rel="noopener">github.com/Marcelao98/KOFSnes</a>.
  Os temas usam só cor e degradê, sem marca nem imagem de ninguém.
</footer>
<div id="aviso" role="status"></div>
<textarea id="copia-manual" aria-hidden="true" tabindex="-1"></textarea>
<script>
(() => {{
  const busca = document.getElementById('busca'), chips = [...document.querySelectorAll('.chip')], aviso = document.getElementById('aviso');
  let cat = '';
  const normal = (t) => t.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  function filtrar() {{
    const q = normal(busca.value.trim()); let n = 0;
    document.querySelectorAll('.grupo').forEach((g) => {{
      let vis = 0;
      g.querySelectorAll('.tema').forEach((t) => {{ const ok = (!cat || t.dataset.cat === cat) && (!q || normal(t.dataset.busca).includes(q)); t.hidden = !ok; if (ok) vis++; }});
      g.hidden = !vis; n += vis;
    }});
    document.getElementById('contagem').textContent = n + ' de {total}';
  }}
  busca.addEventListener('input', filtrar);
  chips.forEach((c) => c.addEventListener('click', () => {{ cat = c.dataset.filtro; chips.forEach((x) => x.classList.toggle('ativo', x === c)); filtrar(); }}));
  let tAviso = 0;
  function avisar(t) {{ aviso.textContent = t; aviso.classList.add('mostra'); clearTimeout(tAviso); tAviso = setTimeout(() => aviso.classList.remove('mostra'), 1600); }}
  document.addEventListener('click', (e) => {{
    const b = e.target.closest('[data-copiar]'); if (!b) return;
    const txt = b.dataset.copiar, css = b.classList.contains('copiar-css');
    const manual = () => {{ const a = document.getElementById('copia-manual'); a.value = txt; a.select(); try {{ document.execCommand('copy'); avisar(css ? 'CSS do tema copiado' : 'copiado: ' + txt); }} catch (er) {{ avisar('selecione e copie com Ctrl+C'); }} }};
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => avisar(css ? 'CSS do tema copiado' : 'copiado: ' + txt), manual);
    else manual();
  }});
  filtrar();
}})();
</script>
'''

(RAIZ / 'docs' / 'guia-de-temas.html').write_text('<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8">'
                                                   '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                                                   + conteudo.replace('<style>', '<style>\nbody { margin: 0; }', 1) + '\n</html>\n')
if len(sys.argv) > 1:
    (pathlib.Path(sys.argv[1]) / 'guia-de-temas-artefato.html').write_text(conteudo)
print(f'{total} temas em {len(itens)} categorias')
