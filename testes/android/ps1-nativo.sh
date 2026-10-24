#!/usr/bin/env bash
# Testa a ponte nativa do PS1 do APK sem celular: compila android/nativo/kofps1.c pro Linux daqui, ligada a um PCSX-ReARMed
# do Linux (o mesmo código do núcleo do APK, compilado com platform=unix), e roda testes/android/TestePs1.java.
#   testes/android/ps1-nativo.sh <pcsx_rearmed_libretro.so do Linux> <programa ou .cue de PS1 LIVRE>
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"; CORE="$(realpath "$1")"; JOGO="$(realpath "$2")"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cp "$CORE" "$T/libretro.so"
clang -O2 -fPIC -shared -Wno-builtin-requires-header -I"$RAIZ/android/nativo/inc" "$RAIZ/android/nativo/kofps1.c" -o "$T/libkofps1.so" -L"$T" -lretro -Wl,-rpath,"$T"
javac -Xlint:-options -d "$T/cls" "$RAIZ/android/src/dev/kofnes/android/Ps1.java" "$RAIZ/testes/android/TestePs1.java" 2>&1 | grep -v "^Picked up" || true
java --enable-native-access=ALL-UNNAMED -Dstdout.encoding=UTF-8 -cp "$T/cls" TestePs1 "$T/libkofps1.so" "$JOGO" "$T" 2>&1 | grep -v "^Picked up"
