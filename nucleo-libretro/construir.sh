#!/usr/bin/env bash
# Compila um núcleo libretro pra WebAssembly e junta com a nossa ponte (ponte.cpp).
# Uso: nucleo-libretro/construir.sh snes9x|gambatte|fceumm|genplus|mgba|fbneo|pcsx|somfm   (sem argumento: todos)
# somfm = só o chip de som do Mega Drive (somfm.c + YM2612/PSG do Genesis Plus GX), pra trilha: saida/som/somfm.js (~100 KB)
# Resultado: nucleo-libretro/saida/<núcleo>.js (um arquivo só, com o .wasm embutido; não vai pro git).
# O módulo se chama Nucleo_<núcleo> (ex.: Nucleo_snes9x) e as funções da ponte são lr_*.
# Precisa: emscripten (no Ubuntu: apt install emscripten) e git. O Snes9x demora ~4 min na primeira vez.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
T="${T:-/tmp/kofnes-libretro}"
mkdir -p "$T" "$AQUI/saida" "$AQUI/saida/som"

# núcleo só de som: os chips do Genesis Plus GX (com a sonda) e o somfm.c no lugar do resto do console
construir_som() {
  local G="$T/genplus" O="$T/obj-somfm"
  if [ ! -d "$G" ]; then git clone -q https://github.com/libretro/Genesis-Plus-GX.git "$G"; fi
  git -C "$G" fetch -q --depth 1 origin aa74d79634cd230f65cce4180e92688e53883d2f 2>/dev/null || true
  git -C "$G" checkout -q -- . && git -C "$G" checkout -q aa74d79634cd230f65cce4180e92688e53883d2f
  git -C "$G" apply "$AQUI/genplus-sonda.patch"
  rm -rf "$O"; mkdir -p "$O"
  local f INC="-I$G/core -I$G/core/sound -I$G/core/cart_hw -I$G/core/cart_hw/svp -I$G/core/cd_hw -I$G/core/input_hw -I$G/core/m68k -I$G/core/z80 -I$G/core/debug -I$G/core/ntsc -I$G/libretro -I$G/libretro/libretro-common/include"
  for f in "$G/core/sound/ym2612.c" "$G/core/sound/psg.c" "$G/core/sound/blip_buf.c" "$AQUI/somfm.c"; do
    emcc -O3 -DNDEBUG -DLSB_FIRST -DALIGN_LONG -DBYTE_ORDER=LITTLE_ENDIAN -DUSE_PER_SOUND_CHANNELS_CONFIG -D__LIBRETRO__ \
      -DINLINE="static inline" $INC -w -c "$f" -o "$O/$(basename "$f" .c).o"
  done
  emcc -O3 "$O"/*.o -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=Nucleo_somfm -s ENVIRONMENT=web,node -s SINGLE_FILE=1 \
    -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16,HEAPU32 \
    -s EXPORTED_FUNCTIONS=_som_iniciar,_som_tocar,_som_mudas,_som_quadro,_som_saida,_som_onda,_som_onda_pos,_malloc,_free \
    -o "$AQUI/saida/som/somfm.js"
  ls -l "$AQUI/saida/som/somfm.js"
}

construir() {
  local nome="$1" repo commit dir lc bc
  if [ "$nome" = somfm ]; then construir_som; return; fi
  case "$nome" in
    snes9x)   repo=https://github.com/libretro/snes9x.git; commit=fae2fea08f74180759ef540ee94259213f503480
              dir="$T/snes9x"; lc="$dir/libretro/libretro-common"; bc="$dir/libretro/snes9x_libretro_emscripten.bc" ;;
    gambatte) repo=https://github.com/libretro/gambatte-libretro.git; commit=d9d6cd06382d1ced30de34d56d3609452323dab1
              dir="$T/gambatte"; lc="$dir/libgambatte/libretro-common"; bc="$dir/gambatte_libretro_emscripten.bc" ;;
    fceumm)   repo=https://github.com/libretro/libretro-fceumm.git; commit=ac0d00a7fc01166f84c7bac01d1084ebfd2b865e
              dir="$T/fceumm"; lc="$dir/src/drivers/libretro/libretro-common"; bc="$dir/fceumm_libretro_emscripten.bc" ;;
    genplus)  repo=https://github.com/libretro/Genesis-Plus-GX.git; commit=aa74d79634cd230f65cce4180e92688e53883d2f
              dir="$T/genplus"; lc="$dir/libretro/libretro-common"; bc="$dir/genesis_plus_gx_libretro_emscripten.bc" ;;
    mgba)     repo=https://github.com/libretro/mgba.git; commit=7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6
              dir="$T/mgba"; lc="$dir/src/platform/libretro"; bc="$dir/build/mgba_libretro.bc" ;;
    fbneo)    repo=https://github.com/libretro/FBNeo.git; commit=2dbbac7623fbae1c7894a6437769e8a3adb78610
              dir="$T/fbneo"; lc="$dir/src/burner/libretro/libretro-common"; bc="$dir/src/burner/libretro/fbneo_neogeo_libretro_emscripten.bc" ;;
    pcsx)     repo=https://github.com/libretro/pcsx_rearmed.git; commit=c8816799b50388e61cfe237fe2cdbb7d8175f20a
              dir="$T/pcsx"; lc="$dir/deps/libretro-common"; bc="$dir/pcsx_rearmed_libretro_emscripten.bc" ;;
    *) echo "núcleo desconhecido: $nome (use snes9x, gambatte, fceumm, genplus, mgba, fbneo, pcsx ou somfm)"; exit 1 ;;
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
    # mGBA é CMake. As sondagens de função do CMake "acham" tudo no emscripten (popcount32, pthread, snprintf_l não existem
    # lá): desliga essas à mão. O libretro dele não compila sem o núcleo de Game Boy (M_CORE_GB), mas o GB do app é o Gambatte
    mgba)     rm -rf "$dir/build" && emcmake cmake -S "$dir" -B "$dir/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_LIBRETRO=ON \
                -DLIBRETRO_STATIC=ON -DBUILD_QT=OFF -DBUILD_SDL=OFF -DSKIP_LIBRARY=ON -DDISABLE_DEPS=ON -DENABLE_DEBUGGERS=OFF \
                -DENABLE_GDB_STUB=OFF -DENABLE_SCRIPTING=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF -DUSE_EPOXY=OFF \
                -DBUILD_LTO=OFF -DHAVE_POPCOUNT32=0 -DHAVE_PTHREAD_H=0 -DHAVE_SNPRINTF_L=0 >/dev/null \
              && cmake --build "$dir/build" --target mgba_libretro -j"$(nproc)" ;;
    # FBNeo só com o Neo Geo (SUBSET=neogeo: ~1 min em vez de horas, núcleo pequeno) e com o zlib dele mesmo
    # PCSX-ReARMed (PlayStation): o emscripten do Ubuntu não deixa baixar a zlib dele (cache congelado): usa a miniz que vem junto
    pcsx)     sed -i '/platform), emscripten)/,/USE_ASYNC_SPU=0/{s/^   USE_MINIZ = 0/   USE_MINIZ = 1/;/-sUSE_ZLIB=1/d}' "$dir/Makefile.libretro"
              (cd "$dir" && emmake make -f Makefile.libretro platform=emscripten -j"$(nproc)") ;;
    fbneo)    (cd "$dir/src/burner/libretro" && make clean platform=emscripten SUBSET=neogeo >/dev/null && make generate-files platform=emscripten SUBSET=neogeo >/dev/null \
                && emmake make -j"$(nproc)" platform=emscripten SUBSET=neogeo EXTERNAL_ZLIB=0) ;;   # generate-files: lista de drivers só do Neo Geo
  esac
  local O="$T/obj-$nome"; rm -rf "$O"; mkdir -p "$O"
  local INC="-I$(dirname "$bc") -I$lc/include -I$lc -I$dir"
  em++ -O3 -DNDEBUG -std=c++11 $INC -c "$AQUI/ponte.cpp" -o "$O/ponte.o"
  # o .bc do emscripten vem sem o libretro-common (STATIC_LINKING): compila aqui o que existir na cópia do núcleo
  local i=0 f
  for f in compat/compat_posix_string compat/compat_strcasestr compat/compat_snprintf compat/compat_strl compat/fopen_utf8 \
           encodings/encoding_utf encodings/encoding_deflate file/file_path file/file_path_io streams/file_stream \
           streams/file_stream_transforms string/stdstring time/rtime vfs/vfs_implementation file/retro_dirent; do
    [ -f "$lc/$f.c" ] || continue
    i=$((i+1)); emcc -O3 -DNDEBUG -I"$lc/include" -c "$lc/$f.c" -o "$O/c$i.o"   # só os cabeçalhos do libretro-common (a pasta do núcleo pode ter outros com o mesmo nome)
  done
  local F=_lr_alloc,_lr_init,_lr_load,_lr_info,_lr_unload,_lr_run,_lr_pad,_lr_fb,_lr_w,_lr_h,_lr_audio,_lr_audio_n,_lr_audio_total
  F=$F,_lr_arquivo,_lr_apagar,_lr_var,_lr_canais,_lr_sonda,_lr_mudas,_lr_onda,_lr_onda_pos,_lr_onda_pos_c,_lr_reset,_lr_state_size,_lr_state_save,_lr_state_load,_lr_mem_ptr,_lr_mem_size,_malloc,_free
  em++ -O3 ${EXTRA_LD:-} "$O"/*.o "$bc" -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
    -s MODULARIZE=1 -s EXPORT_NAME="Nucleo_$nome" -s ENVIRONMENT=web,node -s SINGLE_FILE=1 \
    -s EXPORTED_RUNTIME_METHODS=ccall,HEAPU8,HEAPF64,stringToUTF8,lengthBytesUTF8 -s EXPORTED_FUNCTIONS=$F \
    -o "$AQUI/saida/$nome.js"
  ls -l "$AQUI/saida/$nome.js"
  # Neo Geo: a lista dos jogos (nomes e CRCs) que o app usa pra reconhecer o zip sai do mesmo FBNeo
  if [ "$nome" = fbneo ]; then python3 "$AQUI/lista-neogeo.py" "$dir/gamelist.txt" "$dir/src/burn/drv/neogeo/d_neogeo.cpp" "$AQUI/../web/neogeo-jogos.js"; fi
}

if [ $# -eq 0 ]; then set -- snes9x gambatte fceumm genplus mgba fbneo pcsx somfm; fi
for n in "$@"; do construir "$n"; done
