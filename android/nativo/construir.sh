#!/usr/bin/env bash
# Compila a ponte nativa do PS1 (kofps1.c) pra Android ARM64 SEM o NDK: só o clang/lld do Ubuntu, o jni.h do JDK
# (em inc/) e declarações próprias da libc. As bibliotecas do aparelho (libc, liblog) entram como "stubs" vazios só pro
# linker anotar a dependência; o núcleo é o PCSX-ReARMed já compilado (build do libretro distribuído pelo Lemuroid,
# github.com/Swordfish90/LemuroidCores, GPL-2), baixado aqui pra android/nativo/lib/ (fora do git).
#   android/nativo/construir.sh    -> android/nativo/lib/arm64-v8a/{libkofps1.so, libretro.so}
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; L="$AQUI/lib/arm64-v8a"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$L"
CORE="$L/libretro.so"   # o núcleo se chama assim por dentro (SONAME): no APK ele vai com esse nome
COMMIT="fee2e824525daa22bcf318f96127fe43fa8a15ad"   # LemuroidCores
if [ ! -f "$CORE" ]; then   # pelo git (só esse arquivo): o download direto pelo raw pode ser bloqueado
  git clone -q --filter=blob:none --no-checkout https://github.com/Swordfish90/LemuroidCores.git "$T/lc"
  git -C "$T/lc" sparse-checkout set --no-cone /lemuroid_core_pcsx_rearmed/src/main/jniLibs/arm64-v8a/
  git -C "$T/lc" checkout -q "$COMMIT"
  cp "$T/lc/lemuroid_core_pcsx_rearmed/src/main/jniLibs/arm64-v8a/libpcsx_rearmed_libretro_android.so" "$CORE"
fi
ALVO="--target=aarch64-linux-android24"
for l in c log; do echo 'void kof_stub(void){}' | clang $ALVO -x c -shared -nostdlib -fPIC -fuse-ld=lld -Wl,-soname,lib$l.so -o "$T/lib$l.so" -; done
clang $ALVO -O2 -fPIC -ffreestanding -fno-stack-protector -Wall -Wno-builtin-requires-header -I"$AQUI/inc" -c "$AQUI/kofps1.c" -o "$T/kofps1.o"
clang $ALVO -shared -nostdlib -fuse-ld=lld -Wl,--hash-style=both -Wl,-soname,libkofps1.so -Wl,-z,noexecstack \
  -o "$L/libkofps1.so" "$T/kofps1.o" -L"$T" -L"$L" -lretro -lc -llog
ls -l "$L"
