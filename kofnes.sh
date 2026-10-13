#!/usr/bin/env bash
# KOFnes — abre o emulador (opcionalmente já com uma ROM).
#   ./kofnes.sh                 -> janela com a xícara, Ctrl+O pra abrir ROM
#   ./kofnes.sh jogo.sfc        -> já abre o jogo
# Precisa do Kof (https://github.com/KofLang/Kof4j) no PATH.
ROM=""
if [ -n "${1:-}" ]; then ROM="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; fi
cd "$(dirname "$0")" || exit 1
if [ -n "$ROM" ]; then exec kof run KOFnes.kf "$ROM"; else exec kof run KOFnes.kf; fi
