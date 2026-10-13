#!/usr/bin/env bash
# Versão web/Windows sem Java: compila o núcleo Kof (snes/) pra JavaScript e
# monta UM arquivo só, dist/web/KOFnes.html (navegador não carrega módulos de
# um arquivo local), mais o KOFnes.exe que abre a página numa janela do Edge.
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
cp "$AQUI/nucleo.kf" "$T/src/"
cp -r "$RAIZ/snes" "$T/src/snes"
kof build "$T/src/nucleo.kf" --target js --output "$T/out"
python3 "$RAIZ/empacotar/icone.py" "$T" >/dev/null
python3 "$AQUI/juntar.py" "$T/out" "$AQUI" "$T/icone.png" "$SAIDA/KOFnes.html"
if command -v x86_64-w64-mingw32-gcc >/dev/null; then
    (cd "$T" && cp "$RAIZ/empacotar/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o res.o)
    x86_64-w64-mingw32-gcc -O2 -s -municode -mwindows -o "$SAIDA/KOFnes.exe" "$AQUI/lancador_win.c" "$T/res.o" -lshlwapi
fi
sed "s/$/\r/" "$AQUI/LEIA-ME.txt" > "$SAIDA/LEIA-ME.txt"
rm -f "$RAIZ/dist/KOFnes-sem-java-windows.zip"
(cd "$RAIZ/dist" && mkdir -p z/KOFnes && cp web/* z/KOFnes/ && cd z && zip -qr -9 ../KOFnes-sem-java-windows.zip KOFnes && cd .. && rm -rf z)
ls -l "$SAIDA" "$RAIZ/dist/KOFnes-sem-java-windows.zip"
