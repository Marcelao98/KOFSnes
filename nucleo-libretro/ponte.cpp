// Ponte entre um núcleo libretro (Snes9x, Gambatte, ...) e o JavaScript do KOFnes.
// Faz o papel do "frontend" do libretro: responde às perguntas do núcleo, guarda o quadro de vídeo,
// o áudio e os botões, e expõe poucas funções simples (lr_*) pro JS chamar.
// É a mesma ponte pra qualquer núcleo: tamanho da tela, fps e taxa de áudio vêm de retro_get_system_av_info.
// Cada núcleo tem a sua licença (veja LICENCAS.md).
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <emscripten.h>
#include "libretro.h"

extern "C" {

static uint32_t* quadro = nullptr;     // RGBA (formato do canvas), até maxL x maxA
static unsigned maxL = 0, maxA = 0, larg = 0, alt = 0;
static int copiar = 1;
static uint16_t botoes = 0;            // máscara RETRO_DEVICE_ID_JOYPAD_*
static const unsigned AUDIO_MAX = 32768;   // quadros estéreo por retro_run (sobra até pra núcleo que manda áudio em lotes)
static int16_t audio[AUDIO_MAX * 2];
static unsigned audioQuadros = 0;
static unsigned long totalAudio = 0;
static int formato = RETRO_PIXEL_FORMAT_0RGB1555;   // padrão do libretro até o núcleo pedir outro
static struct retro_system_av_info av;
// av_info pro JS: [largura base, altura base, largura máx, altura máx, proporção, fps, taxa de áudio]
static double infoJs[7];

static void guardarAv(const struct retro_system_av_info* i) {
    av = *i;
    unsigned l = av.geometry.max_width, a = av.geometry.max_height;
    if (l * a > maxL * maxA) { free(quadro); quadro = (uint32_t*)malloc((size_t)l * a * 4); maxL = l; maxA = a; }
}

static inline uint32_t de5(uint32_t v) { return (v << 3) | (v >> 2); }
static void video(const void* dados, unsigned w, unsigned h, size_t pitch) {
    if (!dados) return;                 // quadro repetido (CAN_DUPE): mantém o anterior
    if ((size_t)w * h > (size_t)maxL * maxA) return;
    larg = w; alt = h;
    if (!copiar) return;
    for (unsigned y = 0; y < h; y++) {
        uint32_t* d = quadro + y * w;
        if (formato == RETRO_PIXEL_FORMAT_RGB565) {
            const uint16_t* o = (const uint16_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) {
                uint32_t c = o[x], r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
                d[x] = 0xFF000000u | (de5(b) << 16) | (((g << 2) | (g >> 4)) << 8) | de5(r);
            }
        } else if (formato == RETRO_PIXEL_FORMAT_0RGB1555) {
            const uint16_t* o = (const uint16_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) {
                uint32_t c = o[x], r = (c >> 10) & 31, g = (c >> 5) & 31, b = c & 31;
                d[x] = 0xFF000000u | (de5(b) << 16) | (de5(g) << 8) | de5(r);
            }
        } else {
            const uint32_t* o = (const uint32_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) { uint32_t c = o[x]; d[x] = 0xFF000000u | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF); }
        }
    }
}
static size_t amostras(const int16_t* d, size_t n) {
    if (audioQuadros + n <= AUDIO_MAX) { memcpy(audio + audioQuadros * 2, d, n * 4); audioQuadros += n; }
    totalAudio += n;
    return n;
}
static void amostra(int16_t e, int16_t dir) { int16_t p[2] = { e, dir }; amostras(p, 1); }
static void sondar() {}
static int16_t entrada(unsigned porta, unsigned dispositivo, unsigned, unsigned id) {
    if (porta != 0 || (dispositivo & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return botoes;
    return (botoes >> id) & 1;
}
static void registro(enum retro_log_level, const char* fmt, ...) { va_list a; va_start(a, fmt); vprintf(fmt, a); va_end(a); }
static bool ambiente(unsigned cmd, void* dado) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
        int f = *(enum retro_pixel_format*)dado;
        if (f != RETRO_PIXEL_FORMAT_RGB565 && f != RETRO_PIXEL_FORMAT_XRGB8888 && f != RETRO_PIXEL_FORMAT_0RGB1555) return false;
        formato = f; return true;
    }
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)dado)->log = registro; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char**)dado = "/"; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)dado = true; return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: guardarAv((const struct retro_system_av_info*)dado); return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY: {
        struct retro_system_av_info n = av; n.geometry = *(const struct retro_game_geometry*)dado;
        if (n.geometry.max_width < maxL) n.geometry.max_width = maxL;
        if (n.geometry.max_height < maxA) n.geometry.max_height = maxA;
        guardarAv(&n); return true;
    }
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL: case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
        return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned*)dado = 0; return true;
    default: return false;
    }
}

// sonda do osciloscópio/mudo por canal (jukebox): o núcleo remendado (ex.: gambatte-sonda.patch) define esses
// símbolos de verdade; nos outros valem estes vazios (kof_canais = 0: o núcleo não tem sonda)
__attribute__((weak)) int kof_sonda = 0;
__attribute__((weak)) unsigned kof_mudas = 0;
__attribute__((weak)) int16_t kof_onda[1] = { 0 };
__attribute__((weak)) unsigned kof_ondaPos = 0;
__attribute__((weak)) int kof_canais = 0;
EMSCRIPTEN_KEEPALIVE int lr_canais() { return kof_canais; }          // quantos canais a sonda enxerga (Game Boy: 4)
EMSCRIPTEN_KEEPALIVE void lr_sonda(int liga) { kof_sonda = liga; }
EMSCRIPTEN_KEEPALIVE void lr_mudas(unsigned m) { kof_mudas = m; }    // bit por canal: 1 = mudo
EMSCRIPTEN_KEEPALIVE int16_t* lr_onda() { return kof_onda; }         // canal c, amostra i: kof_onda[c * 4096 + i] (32 kHz, anel)
EMSCRIPTEN_KEEPALIVE unsigned lr_onda_pos() { return kof_ondaPos; }

EMSCRIPTEN_KEEPALIVE void* lr_alloc(size_t n) { return malloc(n); }

EMSCRIPTEN_KEEPALIVE void lr_init() {
    retro_set_environment(ambiente);
    retro_set_video_refresh(video);
    retro_set_audio_sample(amostra);
    retro_set_audio_sample_batch(amostras);
    retro_set_input_poll(sondar);
    retro_set_input_state(entrada);
    retro_init();
}

// `nome` é só pro núcleo ver a extensão (rom.sfc, rom.gb, rom.gbc...); a ROM vai inteira na memória
EMSCRIPTEN_KEEPALIVE int lr_load(const uint8_t* rom, size_t n, const char* nome) {
    struct retro_game_info info = { nome, rom, n, nullptr };
    if (!retro_load_game(&info)) return 0;
    struct retro_system_av_info i;
    retro_get_system_av_info(&i);
    guardarAv(&i);
    larg = av.geometry.base_width; alt = av.geometry.base_height;
    if (quadro) memset(quadro, 0, (size_t)maxL * maxA * 4);
    return 1;
}
EMSCRIPTEN_KEEPALIVE double* lr_info() {
    infoJs[0] = av.geometry.base_width; infoJs[1] = av.geometry.base_height;
    infoJs[2] = av.geometry.max_width; infoJs[3] = av.geometry.max_height;
    infoJs[4] = av.geometry.aspect_ratio > 0 ? av.geometry.aspect_ratio : (double)av.geometry.base_width / av.geometry.base_height;
    infoJs[5] = av.timing.fps; infoJs[6] = av.timing.sample_rate;
    return infoJs;
}

// roda `n` quadros; copiar=1 converte a imagem pro formato do canvas, 0 só emula (avanço rápido, testes)
EMSCRIPTEN_KEEPALIVE void lr_run(int n, int copia) {
    copiar = copia;
    for (int i = 0; i < n; i++) { audioQuadros = 0; retro_run(); }
}
EMSCRIPTEN_KEEPALIVE void lr_unload() { retro_unload_game(); }
EMSCRIPTEN_KEEPALIVE void lr_reset() { retro_reset(); }

// savestate: o núcleo serializa tudo num bloco de bytes (tamanho fixo por jogo)
EMSCRIPTEN_KEEPALIVE size_t lr_state_size() { return retro_serialize_size(); }
EMSCRIPTEN_KEEPALIVE int lr_state_save(uint8_t* dest, size_t n) { return retro_serialize(dest, n) ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int lr_state_load(const uint8_t* src, size_t n) { return retro_unserialize(src, n) ? 1 : 0; }

// memórias do núcleo (RETRO_MEMORY_SAVE_RAM = 0 bateria, 1 relógio RTC, 2 RAM do sistema): o JS lê e grava direto
EMSCRIPTEN_KEEPALIVE uint8_t* lr_mem_ptr(unsigned id) { return (uint8_t*)retro_get_memory_data(id); }
EMSCRIPTEN_KEEPALIVE size_t lr_mem_size(unsigned id) { return retro_get_memory_size(id); }

EMSCRIPTEN_KEEPALIVE void lr_pad(int mascara) { botoes = (uint16_t)mascara; }
EMSCRIPTEN_KEEPALIVE uint32_t* lr_fb() { return quadro; }
EMSCRIPTEN_KEEPALIVE int lr_w() { return larg; }
EMSCRIPTEN_KEEPALIVE int lr_h() { return alt; }
EMSCRIPTEN_KEEPALIVE int16_t* lr_audio() { return audio; }
EMSCRIPTEN_KEEPALIVE int lr_audio_n() { return audioQuadros; }
EMSCRIPTEN_KEEPALIVE double lr_audio_total() { return (double)totalAudio; }

}  // extern "C"
