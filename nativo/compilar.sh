#!/usr/bin/env bash
# Compila o KOFnes só-Kof (alvo nativo do Kof, ELF de Linux x86-64).
# O módulo do Kof é a pasta do arquivo de entrada, então montamos uma pasta
# com este KOFnes.kf + o núcleo ../snes (o mesmo da versão com Java).
#   ./compilar.sh            -> ../dist/KOFnes-so-kof-linux-x64 (o executável)
# Precisa: kof 0.6.3+ e Java 25 (só pra compilar; o executável não usa Java).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src" "$RAIZ/dist"
cp "$AQUI/KOFnes.kf" "$T/src/"
cp -r "$RAIZ/snes" "$T/src/snes"
kof build "$T/src/KOFnes.kf" --target native --release --output "$T/out"
BIN="$(find "$T/out" -type f -perm -u+x | head -1)"
cp "$BIN" "$RAIZ/dist/KOFnes-so-kof-linux-x64"
strip "$RAIZ/dist/KOFnes-so-kof-linux-x64" 2>/dev/null || true
ls -l "$RAIZ/dist/KOFnes-so-kof-linux-x64"
