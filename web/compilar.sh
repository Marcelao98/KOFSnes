#!/usr/bin/env bash
# Versão web/Windows: compila o núcleo Kof (snes/) pra JavaScript e
# monta UM arquivo só, dist/web/KOFnes.html (navegador não carrega módulos de
# um arquivo local), mais o KOFnes.exe (Windows) e o kofnes.sh (Linux), que abrem a página
# numa janela de app do navegador.
#   web/compilar.sh
# Precisa: kof 0.6.3 com as correções do alvo JS (web/kof-js-correcoes.patch),
# python3 e, pro .exe, x86_64-w64-mingw32-gcc.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
SAIDA="$RAIZ/dist/web"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src" "$SAIDA"
# número da versão (cresce sempre): o atualizador do KOFnes.exe compara ele
export KOFNES_BUILD="${KOFNES_BUILD:-$(date -u +%Y%m%d%H%M)}"
cp "$AQUI/nucleo.kf" "$T/src/"
cp -r "$RAIZ/snes" "$T/src/snes"
kof build "$T/src/nucleo.kf" --target js --output "$T/out"
python3 "$RAIZ/empacotar/icone.py" "$T" >/dev/null
python3 "$AQUI/juntar.py" "$T/out" "$AQUI" "$T/icone.png" "$SAIDA/KOFnes.html"
if command -v x86_64-w64-mingw32-gcc >/dev/null; then
    (cd "$T" && cp "$RAIZ/empacotar/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o res.o)
    x86_64-w64-mingw32-gcc -O2 -s -municode -mwindows -o "$SAIDA/KOFnes.exe" "$AQUI/lancador_win.c" "$AQUI/lancador_inet.c" "$T/res.o" -lshlwapi -lwinhttp -lwininet -lws2_32
fi
cp "$SAIDA/KOFnes.html" "$SAIDA/KOFnes-bench.html"   # a mesma página; o nome liga o painel de teste de desempenho
cp "$AQUI/lancador_linux.sh" "$SAIDA/kofnes.sh" && chmod +x "$SAIDA/kofnes.sh"
cp "$T/icone.png" "$SAIDA/KOFnes.png"
# versao.txt: o atualizador do KOFnes.exe compara a versão da página e a do lançador
LANCADOR="$(sed -n 's/^#define LANCADOR \([0-9]*\).*/\1/p' "$AQUI/lancador_win.c")"
{
    printf 'versao=%s\ntamanho=%s\nlancador=%s\n' "$KOFNES_BUILD" "$(stat -c %s "$SAIDA/KOFnes.html")" "$LANCADOR"
    [ -f "$SAIDA/KOFnes.exe" ] && printf 'tamanho_exe=%s\n' "$(stat -c %s "$SAIDA/KOFnes.exe")"
    printf 'lancador_linux=%s\ntamanho_linux=%s\n' "$(sed -n 's/^LANCADOR=\([0-9]*\).*/\1/p' "$SAIDA/kofnes.sh")" "$(stat -c %s "$SAIDA/kofnes.sh")"
} > "$SAIDA/versao.txt"
sed "s/$/\r/" "$AQUI/LEIA-ME.txt" > "$SAIDA/LEIA-ME.txt"
cp "$AQUI/LEIA-ME-linux.txt" "$SAIDA/LEIA-ME-linux.txt"
rm -f "$RAIZ/dist/KOFnes-windows.zip" "$RAIZ/dist/KOFnes-linux.tar.gz"
# Windows: html, exe e versao.txt; Linux: html, kofnes.sh, ícone e versao.txt
(cd "$RAIZ/dist" && mkdir -p z/KOFnes && cd web && cp KOFnes.html KOFnes.exe LEIA-ME.txt versao.txt ../z/KOFnes/ && cd ../z && zip -qr -9 ../KOFnes-windows.zip KOFnes && cd .. && rm -rf z)
(cd "$RAIZ/dist" && mkdir -p z/KOFnes && cd web && cp KOFnes.html kofnes.sh KOFnes.png LEIA-ME-linux.txt versao.txt ../z/KOFnes/ && cd ../z && tar czf ../KOFnes-linux.tar.gz KOFnes && cd .. && rm -rf z)
ls -l "$SAIDA" "$RAIZ/dist/KOFnes-windows.zip" "$RAIZ/dist/KOFnes-linux.tar.gz"
