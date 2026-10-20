"""Gera web/neogeo-jogos.js (nome do set -> [nome do jogo, set pai]) a partir do gamelist.txt que o FBNeo gera
(make generate-files SUBSET=neogeo). O app usa a lista pra reconhecer um zip de Neo Geo pelo nome (mslug.zip) e saber
se ele precisa do zip do pai (jogo "clone"). Uso: lista-neogeo.py <gamelist.txt> <neogeo-jogos.js>"""
import json
import sys

jogos = {}
for linha in open(sys.argv[1], encoding="utf-8", errors="replace"):
    c = [x.strip() for x in linha.split("|")]
    if len(c) < 9 or c[1] in ("name", "") or c[1].startswith("-"):
        continue
    nome, status, titulo, pai, hw = c[1], c[2], c[3], c[4], c[7]
    if "X" in status.split() or "D" in status.split() or "Neo Geo" not in hw or nome == "neogeo":
        continue
    jogos[nome] = [titulo, pai] if pai else [titulo]
with open(sys.argv[2], "w", encoding="utf-8") as f:
    f.write("// Gerado por nucleo-libretro/lista-neogeo.py a partir da lista do FBNeo: set -> [nome do jogo, set pai (clones)].\n")
    f.write("const KofNeoGeoJogos = " + json.dumps(jogos, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(f"{sys.argv[2]}: {len(jogos)} jogos")
