#!/usr/bin/env bash
# Publica uma versão pro atualizador: compila e copia o KOFnes.html e o
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
cat "$RAIZ/publicado/versao.txt"
