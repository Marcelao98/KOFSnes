#!/usr/bin/env bash
# Compila o núcleo Snes9x (libretro) pra WebAssembly e junta com a nossa ponte (ponte.cpp).
# Resultado: nucleo-snes9x/saida/snes9x.js (um arquivo só, com o .wasm embutido, ~4 MB).
# O web/compilar.sh embute esse arquivo no dist/web/KOFnes-bench.html (só no arquivo de teste de celular).
# Precisa: emscripten (no Ubuntu: apt install emscripten) e git. Demora ~4 min na primeira vez.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
COMMIT=fae2fea08f74180759ef540ee94259213f503480      # libretro/snes9x usado nos testes
T="${T:-/tmp/kofnes-snes9x}"; S9="$T/snes9x"; O="$T/obj"; LC="$S9/libretro/libretro-common"
mkdir -p "$T" "$O" "$AQUI/saida"
if [ ! -d "$S9" ]; then git clone -q https://github.com/libretro/snes9x.git "$S9"; fi
git -C "$S9" checkout -q "$COMMIT"
(cd "$S9/libretro" && emmake make -j"$(nproc)" platform=emscripten)
INC="-I$S9/libretro -I$LC/include -I$S9"
em++ -O3 -DNDEBUG -std=c++11 $INC -c "$AQUI/ponte.cpp" -o "$O/ponte.o"
i=0
for f in compat/compat_posix_string compat/compat_strcasestr compat/compat_snprintf compat/compat_strl compat/fopen_utf8 \
         encodings/encoding_utf encodings/encoding_deflate file/file_path file/file_path_io streams/file_stream \
         streams/file_stream_transforms string/stdstring time/rtime vfs/vfs_implementation file/retro_dirent; do
  i=$((i+1)); emcc -O3 -DNDEBUG $INC -c "$LC/$f.c" -o "$O/c$i.o"
done
em++ -O3 "$O"/*.o "$S9/libretro/snes9x_libretro_emscripten.bc" -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
  -s MODULARIZE=1 -s EXPORT_NAME=Snes9xModulo -s ENVIRONMENT=web,node -s SINGLE_FILE=1 -s EXPORTED_RUNTIME_METHODS=ccall,HEAPU8 \
  -s EXPORTED_FUNCTIONS=_s9x_alloc,_s9x_init,_s9x_load,_s9x_unload,_s9x_run,_s9x_pad,_s9x_fb,_s9x_w,_s9x_h,_s9x_audio,_s9x_audio_n,_s9x_audio_total,_s9x_reset,_s9x_state_size,_s9x_state_save,_s9x_state_load,_s9x_sram_ptr,_s9x_sram_size,_malloc,_free \
  -o "$AQUI/saida/snes9x.js"
ls -l "$AQUI/saida/snes9x.js"
