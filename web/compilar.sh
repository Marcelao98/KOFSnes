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
# PC: SNES no núcleo Kof; Game Boy pelo Gambatte em WebAssembly, se ele estiver compilado (nucleo-libretro/construir.sh gambatte)
if [ -f "$RAIZ/nucleo-libretro/saida/gambatte.js" ]; then
    python3 "$AQUI/juntar.py" "$T/out" "$AQUI" "$T/icone.png" "$SAIDA/KOFnes.html" "$RAIZ/nucleo-libretro/saida" pc
else
    python3 "$AQUI/juntar.py" "$T/out" "$AQUI" "$T/icone.png" "$SAIDA/KOFnes.html"
fi
# Android: o mesmo app com os núcleos libretro (Snes9x, Gambatte...) e o controle virtual (precisa do
# nucleo-libretro/saida/snes9x.js; veja nucleo-libretro/construir.sh)
if [ -f "$RAIZ/nucleo-libretro/saida/snes9x.js" ]; then
    python3 "$AQUI/juntar.py" "$T/out" "$AQUI" "$T/icone.png" "$SAIDA/KOFnes-android.html" "$RAIZ/nucleo-libretro/saida"
    # pasta pronta pra publicar como site (GitHub Pages) e instalar no celular como app (PWA)
    mkdir -p "$SAIDA/android" && cp "$SAIDA/KOFnes-android.html" "$SAIDA/android/index.html" && cp "$AQUI/pwa/manifest.webmanifest" "$AQUI/pwa/sw.js" "$SAIDA/android/"
    python3 - "$T/icone.png" "$SAIDA/android" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
for n in (192, 512):
    im.resize((n, n), Image.NEAREST).save(f"{sys.argv[2]}/icone-{n}.png")
PY
fi
if command -v x86_64-w64-mingw32-gcc >/dev/null; then
    (cd "$T" && cp "$RAIZ/empacotar/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o res.o)
    x86_64-w64-mingw32-gcc -O2 -s -municode -mwindows -o "$SAIDA/KOFnes.exe" "$AQUI/lancador_win.c" "$AQUI/lancador_inet.c" "$T/res.o" -lshlwapi -lwinhttp -lwininet -lws2_32
fi
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
rm -f "$RAIZ/dist/KOFstation-windows.zip" "$RAIZ/dist/KOFstation-linux.tar.gz"
# Windows: html, exe e versao.txt; Linux: html, kofnes.sh, ícone e versao.txt. A pasta e o pacote se chamam KOFstation;
# os arquivos de dentro mantêm o nome KOFnes.* (o atualizador e o perfil do navegador de quem já usa dependem deles)
(cd "$RAIZ/dist" && mkdir -p z/KOFstation && cd web && cp KOFnes.html KOFnes.exe LEIA-ME.txt versao.txt ../z/KOFstation/ && cd ../z && zip -qr -9 ../KOFstation-windows.zip KOFstation && cd .. && rm -rf z)
(cd "$RAIZ/dist" && mkdir -p z/KOFstation && cd web && cp KOFnes.html kofnes.sh KOFnes.png LEIA-ME-linux.txt versao.txt ../z/KOFstation/ && cd ../z && tar czf ../KOFstation-linux.tar.gz KOFstation && cd .. && rm -rf z)
ls -l "$SAIDA" "$RAIZ/dist/KOFstation-windows.zip" "$RAIZ/dist/KOFstation-linux.tar.gz"
