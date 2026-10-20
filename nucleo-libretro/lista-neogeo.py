"""Gera web/neogeo-jogos.js a partir do FBNeo (depois do make generate-files SUBSET=neogeo):
  KofNeoGeoJogos: nome do set -> [nome do jogo, set pai (clones)]   (do gamelist.txt)
  KofNeoGeoCrc:   CRC32 de cada chip de programa (68K, "P-ROM") -> sets que usam   (do d_neogeo.cpp)
O app reconhece um zip de Neo Geo pelo nome (mslug.zip) ou, se o nome for outro, pelos CRCs que o próprio zip guarda.
Uso: lista-neogeo.py <gamelist.txt> <d_neogeo.cpp> <neogeo-jogos.js>"""
import json
import re
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

fonte = open(sys.argv[2], encoding="latin-1").read()
descs = {}   # prefixo -> CRCs dos chips de programa
for m in re.finditer(r"static struct BurnRomInfo (\w+)RomDesc\[\] = \{(.*?)\n\};", fonte, re.S):
    descs[m.group(1)] = [c.lower() for c in re.findall(r'\{\s*"[^"]+",\s*0x[0-9a-fA-F]+,\s*0x([0-9a-fA-F]{8}),\s*1\s*\|\s*BRF_ESS\s*\|\s*BRF_PRG', m.group(2))]
crc = {}
for m in re.finditer(r'struct BurnDriver\w*\s+BurnDrv\w+\s*=\s*\{\s*"(\w+)"(.*?)\n\};', fonte, re.S):
    nome, corpo = m.group(1), m.group(2)
    r = re.search(r"(\w+)RomInfo", corpo)
    if nome not in jogos or not r:
        continue
    for c in descs.get(r.group(1), []):
        crc.setdefault(c, []).append(nome)
with open(sys.argv[3], "w", encoding="utf-8") as f:
    f.write("// Gerado por nucleo-libretro/lista-neogeo.py a partir do FBNeo: set -> [nome do jogo, set pai (clones)] e\n")
    f.write("// CRC32 dos chips de programa -> sets (pra reconhecer o zip pelo conteúdo quando o nome do arquivo é outro).\n")
    f.write("const KofNeoGeoJogos = " + json.dumps(jogos, ensure_ascii=False, separators=(",", ":")) + ";\n")
    f.write("const KofNeoGeoCrc = " + json.dumps(crc, separators=(",", ":")) + ";\n")
print(f"{sys.argv[3]}: {len(jogos)} jogos, {len(crc)} CRCs de programa")
