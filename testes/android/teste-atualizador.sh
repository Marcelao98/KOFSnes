#!/usr/bin/env bash
# Testa o atualizador do APK (android/src/.../Atualizador.java) sem celular: Java comum + servidor local no lugar do GitHub.
#   testes/android/teste-atualizador.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"; T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
mkdir -p "$T/srv" "$T/cls"
javac --release 8 -Xlint:-options -d "$T/cls" "$RAIZ/android/src/dev/kofnes/android/Atualizador.java" "$RAIZ/testes/android/TesteAtualizador.java" 2>&1 | grep -v "^Picked up" || true
(cd "$T/srv" && exec python3 -m http.server 8799 --bind 127.0.0.1 >/dev/null 2>&1) & SRV=$!
sleep 1
java -Dstdout.encoding=UTF-8 -cp "$T/cls" TesteAtualizador "$T" "http://127.0.0.1:8799/publicado/" 2>&1 | grep -v "^Picked up"
