#!/usr/bin/env bash
# Compila um núcleo libretro pra WebAssembly e junta com a nossa ponte (ponte.cpp).
# Uso: nucleo-libretro/construir.sh snes9x|gambatte|fceumm|genplus   (sem argumento: todos)
# Resultado: nucleo-libretro/saida/<núcleo>.js (um arquivo só, com o .wasm embutido; não vai pro git).
# O módulo se chama Nucleo_<núcleo> (ex.: Nucleo_snes9x) e as funções da ponte são lr_*.
# Precisa: emscripten (no Ubuntu: apt install emscripten) e git. O Snes9x demora ~4 min na primeira vez.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${T:-/tmp/kofnes-libretro}"
mkdir -p "$T" "$AQUI/saida"

construir() {
  local nome="$1" repo commit dir lc bc
  case "$nome" in
    snes9x)   repo=https://github.com/libretro/snes9x.git; commit=fae2fea08f74180759ef540ee94259213f503480
              dir="$T/snes9x"; lc="$dir/libretro/libretro-common"; bc="$dir/libretro/snes9x_libretro_emscripten.bc" ;;
    gambatte) repo=https://github.com/libretro/gambatte-libretro.git; commit=d9d6cd06382d1ced30de34d56d3609452323dab1
              dir="$T/gambatte"; lc="$dir/libgambatte/libretro-common"; bc="$dir/gambatte_libretro_emscripten.bc" ;;
    fceumm)   repo=https://github.com/libretro/libretro-fceumm.git; commit=ac0d00a7fc01166f84c7bac01d1084ebfd2b865e
              dir="$T/fceumm"; lc="$dir/src/drivers/libretro/libretro-common"; bc="$dir/fceumm_libretro_emscripten.bc" ;;
    genplus)  repo=https://github.com/libretro/Genesis-Plus-GX.git; commit=aa74d79634cd230f65cce4180e92688e53883d2f
              dir="$T/genplus"; lc="$dir/libretro/libretro-common"; bc="$dir/genesis_plus_gx_libretro_emscripten.bc" ;;
    *) echo "núcleo desconhecido: $nome (use snes9x, gambatte, fceumm ou genplus)"; exit 1 ;;
  esac
  if [ ! -d "$dir" ]; then git clone -q "$repo" "$dir"; fi
  git -C "$dir" fetch -q --depth 1 origin "$commit" 2>/dev/null || true
  git -C "$dir" checkout -q -- . && git -C "$dir" checkout -q "$commit"
  # remendo do KOFnes (sonda do osciloscópio e mudo por canal), se existir pro núcleo
  if [ -f "$AQUI/$nome-sonda.patch" ]; then git -C "$dir" apply "$AQUI/$nome-sonda.patch"; fi
  case "$nome" in
    snes9x)   (cd "$dir/libretro" && emmake make -j"$(nproc)" platform=emscripten) ;;
    gambatte|fceumm) (cd "$dir" && emmake make -f Makefile.libretro -j"$(nproc)" platform=emscripten) ;;
    # Genesis Plus GX sem o leitor de imagem de CD (CHD): Sega CD fica pra depois e o núcleo fica ~1 MB menor
    genplus)  (cd "$dir" && emmake make -f Makefile.libretro -j"$(nproc)" platform=emscripten HAVE_CHD=0) ;;
  esac
  local O="$T/obj-$nome"; rm -rf "$O"; mkdir -p "$O"
  local INC="-I$(dirname "$bc") -I$lc/include -I$dir"
  em++ -O3 -DNDEBUG -std=c++11 $INC -c "$AQUI/ponte.cpp" -o "$O/ponte.o"
  # o .bc do emscripten vem sem o libretro-common (STATIC_LINKING): compila aqui o que existir na cópia do núcleo
  local i=0 f
  for f in compat/compat_posix_string compat/compat_strcasestr compat/compat_snprintf compat/compat_strl compat/fopen_utf8 \
           encodings/encoding_utf encodings/encoding_deflate file/file_path file/file_path_io streams/file_stream \
           streams/file_stream_transforms string/stdstring time/rtime vfs/vfs_implementation file/retro_dirent; do
    [ -f "$lc/$f.c" ] || continue
    i=$((i+1)); emcc -O3 -DNDEBUG $INC -c "$lc/$f.c" -o "$O/c$i.o"
  done
  local F=_lr_alloc,_lr_init,_lr_load,_lr_info,_lr_unload,_lr_run,_lr_pad,_lr_fb,_lr_w,_lr_h,_lr_audio,_lr_audio_n,_lr_audio_total
  F=$F,_lr_var,_lr_canais,_lr_sonda,_lr_mudas,_lr_onda,_lr_onda_pos,_lr_onda_pos_c,_lr_reset,_lr_state_size,_lr_state_save,_lr_state_load,_lr_mem_ptr,_lr_mem_size,_malloc,_free
  em++ -O3 ${EXTRA_LD:-} "$O"/*.o "$bc" -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
    -s MODULARIZE=1 -s EXPORT_NAME="Nucleo_$nome" -s ENVIRONMENT=web,node -s SINGLE_FILE=1 \
    -s EXPORTED_RUNTIME_METHODS=ccall,HEAPU8,HEAPF64,stringToUTF8,lengthBytesUTF8 -s EXPORTED_FUNCTIONS=$F \
    -o "$AQUI/saida/$nome.js"
  ls -l "$AQUI/saida/$nome.js"
}

if [ $# -eq 0 ]; then set -- snes9x gambatte fceumm genplus; fi
for n in "$@"; do construir "$n"; done
