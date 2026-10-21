#!/usr/bin/env bash
# Publica uma versão pro atualizador: compila e copia o KOFnes.html, os núcleos e o
# versao.txt pra publicado/ (que vai pro git). O KOFnes.exe de quem já tem
# o emulador lê publicado/versao.txt no GitHub e baixa a página nova sozinho.
#   web/publicar.sh && git add publicado && git commit && git push
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
"$AQUI/compilar.sh"
mkdir -p "$RAIZ/publicado"
cp "$RAIZ/dist/web/KOFnes.html" "$RAIZ/dist/web/KOFstation.exe" "$RAIZ/dist/web/kofnes.sh" "$RAIZ/dist/web/versao.txt" "$RAIZ/publicado/"
# o lançador 6+ baixa KOFstation.*; os lançadores antigos (KOFnes.exe 5) e o kofnes.sh ainda baixam KOFnes.*: vão os dois nomes
cp "$RAIZ/dist/web/KOFnes.html" "$RAIZ/publicado/KOFstation.html"
cp "$RAIZ/dist/web/KOFstation.exe" "$RAIZ/publicado/KOFnes.exe"
# núcleos (nucleos/<núcleo>-<hash>.js): só os que o versao.txt lista; os de versões velhas saem (o histórico do git guarda)
rm -rf "$RAIZ/publicado/nucleos" && mkdir -p "$RAIZ/publicado/nucleos"
sed -n 's/^nucleo=\([^:]*\):.*/\1/p' "$RAIZ/dist/web/versao.txt" | while read -r f; do cp "$RAIZ/dist/web/nucleos/$f" "$RAIZ/publicado/nucleos/"; done
# celular (APK): a página do celular e todos os núcleos que ela usa (o Snes9x só existe lá); o app lê publicado/android/
H="$RAIZ/dist/web/KOFnes-android.html"
if [ -f "$H" ]; then
  mkdir -p "$RAIZ/publicado/android" && cp "$H" "$RAIZ/publicado/android/"
  {
    grep '^versao=' "$RAIZ/dist/web/versao.txt"
    echo "casca=$(sed -n 's/.*static final int CASCA = \([0-9]*\);.*/\1/p' "$RAIZ/android/src/dev/kofnes/android/MainActivity.java")"
    echo "html=KOFnes-android.html:$(stat -c %s "$H")"
    grep -o 'nucleos/[a-z0-9]*-[0-9a-f]\{8\}\.js' "$H" | sort -u | while read -r n; do
      cp "$RAIZ/dist/web/$n" "$RAIZ/publicado/nucleos/"; echo "nucleo=${n#nucleos/}:$(stat -c %s "$RAIZ/dist/web/$n")"
    done
  } > "$RAIZ/publicado/android/versao.txt"
  cat "$RAIZ/publicado/android/versao.txt"
fi
cat "$RAIZ/publicado/versao.txt"
