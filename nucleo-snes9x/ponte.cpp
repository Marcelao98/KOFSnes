// Ponte entre o núcleo Snes9x (libretro) e o JavaScript do KOFnes.
// Faz o papel do "frontend" do libretro: responde às perguntas do núcleo, guarda o quadro de vídeo,
// o áudio e os botões, e expõe poucas funções simples (s9x_*) pro JS chamar.
// O Snes9x tem licença própria, só pra uso NÃO comercial (veja LICENCA-SNES9X.txt).
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <emscripten.h>
#include "libretro.h"

extern "C" {

static uint32_t* quadro = nullptr;     // RGBA (formato do canvas), até 512x478
static unsigned larg = 0, alt = 0;
static int copiar = 1;
static uint16_t botoes = 0;            // máscara RETRO_DEVICE_ID_JOYPAD_*
static int16_t audio[16384 * 2];
static unsigned audioQuadros = 0;
static unsigned long totalAudio = 0;
static int formato = RETRO_PIXEL_FORMAT_RGB565;   // o Snes9x pede RGB565 (16 bits) no libretro

static void video(const void* dados, unsigned w, unsigned h, size_t pitch) {
    larg = w; alt = h;
    if (!dados || !copiar) return;
    for (unsigned y = 0; y < h; y++) {
        uint32_t* d = quadro + y * w;
        if (formato == RETRO_PIXEL_FORMAT_RGB565) {
            const uint16_t* o = (const uint16_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) {
                uint32_t c = o[x], r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
                d[x] = 0xFF000000u | (((b << 3) | (b >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | ((r << 3) | (r >> 2));
            }
        } else {
            const uint32_t* o = (const uint32_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) { uint32_t c = o[x]; d[x] = 0xFF000000u | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF); }
        }
    }
}
static void amostra(int16_t, int16_t) {}
static size_t amostras(const int16_t* d, size_t n) {
    if (audioQuadros + n <= 16384) { memcpy(audio + audioQuadros * 2, d, n * 4); audioQuadros += n; }
    totalAudio += n;
    return n;
}
static void sondar() {}
static int16_t entrada(unsigned porta, unsigned dispositivo, unsigned, unsigned id) {
    if (porta != 0 || dispositivo != RETRO_DEVICE_JOYPAD) return 0;
    return (botoes >> id) & 1;
}
static void registro(enum retro_log_level, const char* fmt, ...) { va_list a; va_start(a, fmt); vprintf(fmt, a); va_end(a); }
static bool ambiente(unsigned cmd, void* dado) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: formato = *(enum retro_pixel_format*)dado; return formato == RETRO_PIXEL_FORMAT_RGB565 || formato == RETRO_PIXEL_FORMAT_XRGB8888;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)dado)->log = registro; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char**)dado = "/"; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)dado = true; return true;
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL: case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
        return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned*)dado = 0; return true;
    default: return false;
    }
}

EMSCRIPTEN_KEEPALIVE void* s9x_alloc(size_t n) { return malloc(n); }

EMSCRIPTEN_KEEPALIVE void s9x_init() {
    quadro = (uint32_t*)malloc(512 * 478 * 4);
    retro_set_environment(ambiente);
    retro_set_video_refresh(video);
    retro_set_audio_sample(amostra);
    retro_set_audio_sample_batch(amostras);
    retro_set_input_poll(sondar);
    retro_set_input_state(entrada);
    retro_init();
}

EMSCRIPTEN_KEEPALIVE int s9x_load(const uint8_t* rom, size_t n) {
    struct retro_game_info info = { "rom.sfc", rom, n, nullptr };
    return retro_load_game(&info) ? 1 : 0;
}

// roda `n` quadros; copiar=1 converte a imagem pro formato do canvas (como o KOFnes faz), 0 só emula
EMSCRIPTEN_KEEPALIVE void s9x_run(int n, int copia) {
    copiar = copia;
    for (int i = 0; i < n; i++) { audioQuadros = 0; retro_run(); }
}
EMSCRIPTEN_KEEPALIVE void s9x_unload() { retro_unload_game(); }
EMSCRIPTEN_KEEPALIVE void s9x_reset() { retro_reset(); }

// savestate: o Snes9x serializa tudo num bloco de bytes (tamanho fixo por ROM)
EMSCRIPTEN_KEEPALIVE size_t s9x_state_size() { return retro_serialize_size(); }
EMSCRIPTEN_KEEPALIVE int s9x_state_save(uint8_t* dest, size_t n) { return retro_serialize(dest, n) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int s9x_state_load(const uint8_t* src, size_t n) { return retro_unserialize(src, n) ? 1 : 0; }

// RAM da bateria (SRAM): o JS lê e grava direto nesse trecho de memória
EMSCRIPTEN_KEEPALIVE uint8_t* s9x_sram_ptr() { return (uint8_t*)retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); }
EMSCRIPTEN_KEEPALIVE size_t s9x_sram_size() { return retro_get_memory_size(RETRO_MEMORY_SAVE_RAM); }


EMSCRIPTEN_KEEPALIVE void s9x_pad(int mascara) { botoes = (uint16_t)mascara; }
EMSCRIPTEN_KEEPALIVE uint32_t* s9x_fb() { return quadro; }
EMSCRIPTEN_KEEPALIVE int s9x_w() { return larg; }
EMSCRIPTEN_KEEPALIVE int s9x_h() { return alt; }
EMSCRIPTEN_KEEPALIVE int16_t* s9x_audio() { return audio; }
EMSCRIPTEN_KEEPALIVE int s9x_audio_n() { return audioQuadros; }
EMSCRIPTEN_KEEPALIVE double s9x_audio_total() { return (double)totalAudio; }

}  // extern "C"
