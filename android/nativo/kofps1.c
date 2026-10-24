// Ponte nativa do PlayStation no Android: liga o PCSX-ReARMed já compilado pra ARM64 (com o recompilador ari64,
// o build do libretro que o Lemuroid distribui) ao Java do app. Faz o papel da ponte.cpp do WebAssembly: chama as
// funções retro_* e entrega a imagem (RGBA) e o som (16 bits estéreo) em buffers diretos que o Java lê sem cópia.
// Compila SEM o NDK (android/nativo/construir.sh): só o clang do Ubuntu, o jni.h do JDK e declarações próprias da libc.
// Também compila pro Linux daqui, pros testes (testes/android/ps1-nativo.sh).
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include "jni.h"
#include "libretro.h"

// o pouco da libc que a ponte usa (no Android vem da libc.so do aparelho)
typedef struct ARQ ARQ;
ARQ *fopen(const char *, const char *);
size_t fread(void *, size_t, size_t, ARQ *);
size_t fwrite(const void *, size_t, size_t, ARQ *);
int fclose(ARQ *);
int snprintf(char *, size_t, const char *, ...);
int vsnprintf(char *, size_t, const char *, va_list);
void *memcpy(void *, const void *, size_t);
void *memset(void *, int, size_t);
int memcmp(const void *, const void *, size_t);
int strcmp(const char *, const char *);
size_t strlen(const char *);
char *strncpy(char *, const char *, size_t);
#ifdef __ANDROID__
int __android_log_print(int, const char *, const char *, ...);
#define ANOTAR(...) __android_log_print(4, "KOFps1", __VA_ARGS__)
#else
int printf(const char *, ...);
#define ANOTAR(...) (printf(__VA_ARGS__), printf("\n"))
#endif

// ---- estado da ponte ----
static char dirSistema[512], dirSaves[512], arqCartao[600], opcoes[4096];
static enum retro_pixel_format formato = RETRO_PIXEL_FORMAT_0RGB1555;
static uint8_t *video;               // buffer direto do Java: RGBA, até 1024x512
static int16_t *som;                  // buffer direto do Java: estéreo intercalado
static int videoMax, somMax, larg, alt, somN, novoQuadro;
static uint16_t botoes;               // RETRO_DEVICE_ID_JOYPAD_* em bits
static uint8_t cartaoVisto[128 * 1024];
static int carregado;

static const char *valorOpcao(const char *chave) {   // opcoes = "chave=valor\n..."
    static char v[256];
    size_t n = strlen(chave);
    for (const char *p = opcoes; *p; ) {
        const char *fim = p; while (*fim && *fim != '\n') fim++;
        if ((size_t)(fim - p) > n && p[n] == '=' && !memcmp(p, chave, n)) {
            size_t k = fim - p - n - 1; if (k > 255) k = 255;
            memcpy(v, p + n + 1, k); v[k] = 0; return v;
        }
        p = *fim ? fim + 1 : fim;
    }
    return NULL;
}

static void anotar(enum retro_log_level nivel, const char *fmt, ...) {
    char b[512]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
    if (nivel >= RETRO_LOG_WARN) ANOTAR("%s", b);
    (void)nivel;
}

static bool ambiente(unsigned cmd, void *dado) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)dado = dirSistema; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)dado = dirSaves; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)dado = true; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: formato = *(const enum retro_pixel_format *)dado; return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)dado)->log = anotar; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *v = dado;
        v->value = v->key ? valorOpcao(v->key) : NULL;
        return v->value != NULL;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)dado = false; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)dado = 0; return true;
    default: return false;
    }
}

static void quadro(const void *d, unsigned w, unsigned h, size_t pitch) {
    if (!d || !video || (int)(w * h) > videoMax) return;   // repetido (CAN_DUPE): fica o anterior
    larg = w; alt = h; novoQuadro = 1;
    uint8_t *o = video;
    for (unsigned y = 0; y < h; y++) {
        const uint8_t *l = (const uint8_t *)d + y * pitch;
        if (formato == RETRO_PIXEL_FORMAT_XRGB8888) {
            const uint32_t *p = (const uint32_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint32_t c = p[x]; o[0] = c >> 16; o[1] = c >> 8; o[2] = c; o[3] = 255; }
        } else if (formato == RETRO_PIXEL_FORMAT_RGB565) {
            const uint16_t *p = (const uint16_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint16_t c = p[x]; o[0] = ((c >> 11) & 31) * 255 / 31; o[1] = ((c >> 5) & 63) * 255 / 63; o[2] = (c & 31) * 255 / 31; o[3] = 255; }
        } else {
            const uint16_t *p = (const uint16_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint16_t c = p[x]; o[0] = ((c >> 10) & 31) * 255 / 31; o[1] = ((c >> 5) & 31) * 255 / 31; o[2] = (c & 31) * 255 / 31; o[3] = 255; }
        }
    }
}
static size_t somLote(const int16_t *d, size_t quadros) {
    size_t k = quadros * 2;
    if (som && somN + (int)k <= somMax) { memcpy(som + somN, d, k * 2); somN += k; }
    return quadros;
}
static void somUm(int16_t e, int16_t dir) { int16_t a[2] = { e, dir }; somLote(a, 1); }
static void nadaInput(void) {}
static int16_t estadoInput(unsigned porta, unsigned disp, unsigned idx, unsigned id) {
    if (porta || disp != RETRO_DEVICE_JOYPAD) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return botoes;
    return (botoes >> id) & 1;
    (void)idx;
}

// cartão de memória 1 = SAVE_RAM do PCSX: lido do arquivo ao abrir, gravado quando muda
static void cartaoLer(void) {
    uint8_t *m = retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); size_t n = retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    if (!m || !n || n > sizeof cartaoVisto) return;
    ARQ *f = fopen(arqCartao, "rb");
    if (f) { fread(m, 1, n, f); fclose(f); }
    memcpy(cartaoVisto, m, n);
}
static int cartaoGravar(void) {
    uint8_t *m = retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); size_t n = retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    if (!m || !n || n > sizeof cartaoVisto || !memcmp(m, cartaoVisto, n)) return 0;
    ARQ *f = fopen(arqCartao, "wb");
    if (!f) return 0;
    fwrite(m, 1, n, f); fclose(f);
    memcpy(cartaoVisto, m, n);
    return 1;
}

#define J(nome) Java_dev_kofnes_android_Ps1_##nome
static void texto(JNIEnv *env, jstring s, char *dest, size_t max) {
    const char *c = (*env)->GetStringUTFChars(env, s, NULL);
    strncpy(dest, c, max - 1); dest[max - 1] = 0;
    (*env)->ReleaseStringUTFChars(env, s, c);
}

// buffers diretos (ByteBuffer.allocateDirect) do Java: imagem RGBA e som
JNIEXPORT void JNICALL J(buffers)(JNIEnv *env, jclass c, jobject v, jobject s) {
    video = (*env)->GetDirectBufferAddress(env, v); videoMax = (int)((*env)->GetDirectBufferCapacity(env, v) / 4);
    som = (*env)->GetDirectBufferAddress(env, s); somMax = (int)((*env)->GetDirectBufferCapacity(env, s) / 2);
    (void)c;
}

// abre o jogo; devolve "" ou o motivo do erro. info[] = largura, altura, fps*1000, taxa de áudio
JNIEXPORT jstring JNICALL J(abrir)(JNIEnv *env, jclass c, jstring jogo, jstring sistema, jstring saves, jstring cartao, jstring ops, jintArray info) {
    static int iniciado;
    char caminho[1024];
    texto(env, jogo, caminho, sizeof caminho); texto(env, sistema, dirSistema, sizeof dirSistema);
    texto(env, saves, dirSaves, sizeof dirSaves); texto(env, cartao, arqCartao, sizeof arqCartao); texto(env, ops, opcoes, sizeof opcoes);
    if (carregado) { cartaoGravar(); retro_unload_game(); carregado = 0; }
    if (!iniciado) {
        retro_set_environment(ambiente); retro_set_video_refresh(quadro); retro_set_audio_sample(somUm);
        retro_set_audio_sample_batch(somLote); retro_set_input_poll(nadaInput); retro_set_input_state(estadoInput);
        retro_init(); iniciado = 1;
    }
    struct retro_game_info g = { caminho, NULL, 0, NULL };
    if (!retro_load_game(&g)) return (*env)->NewStringUTF(env, "o PlayStation nativo não abriu esse jogo");
    retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    carregado = 1; cartaoLer();
    struct retro_system_av_info av; retro_get_system_av_info(&av);
    jint i[4] = { (jint)av.geometry.base_width, (jint)av.geometry.base_height, (jint)(av.timing.fps * 1000), (jint)av.timing.sample_rate };
    (*env)->SetIntArrayRegion(env, info, 0, 4, i);
    (void)c;
    return (*env)->NewStringUTF(env, "");
}

// roda um quadro; devolve quantas amostras de som (int16) vieram. Imagem nova: largura()/altura() > 0
JNIEXPORT jint JNICALL J(rodar)(JNIEnv *env, jclass c, jint pad) {
    if (!carregado) return 0;
    static int vez;
    botoes = (uint16_t)pad; somN = 0; novoQuadro = 0;
    retro_run();
    if (++vez % 300 == 0) cartaoGravar();   // ~5 s
    (void)env; (void)c;
    return somN;
}
JNIEXPORT jint JNICALL J(largura)(JNIEnv *env, jclass c) { (void)env; (void)c; return novoQuadro ? larg : 0; }
JNIEXPORT jint JNICALL J(altura)(JNIEnv *env, jclass c) { (void)env; (void)c; return alt; }
JNIEXPORT void JNICALL J(reiniciar)(JNIEnv *env, jclass c) { (void)env; (void)c; if (carregado) retro_reset(); }
JNIEXPORT jboolean JNICALL J(gravarCartao)(JNIEnv *env, jclass c) { (void)env; (void)c; return carregado && cartaoGravar(); }
JNIEXPORT void JNICALL J(fechar)(JNIEnv *env, jclass c) {
    (void)env; (void)c;
    if (carregado) { cartaoGravar(); retro_unload_game(); carregado = 0; }
}

// savestate: o app guarda os bytes como nos outros consoles
JNIEXPORT jbyteArray JNICALL J(salvarEstado)(JNIEnv *env, jclass c) {
    (void)c;
    if (!carregado) return NULL;
    size_t n = retro_serialize_size();
    jbyteArray a = (*env)->NewByteArray(env, (jsize)n);
    jbyte *p = (*env)->GetByteArrayElements(env, a, NULL);
    bool ok = retro_serialize(p, n);
    (*env)->ReleaseByteArrayElements(env, a, p, 0);
    return ok ? a : NULL;
}
JNIEXPORT jboolean JNICALL J(carregarEstado)(JNIEnv *env, jclass c, jbyteArray a) {
    (void)c;
    if (!carregado) return 0;
    jsize n = (*env)->GetArrayLength(env, a);
    jbyte *p = (*env)->GetByteArrayElements(env, a, NULL);
    bool ok = retro_unserialize(p, (size_t)n);
    (*env)->ReleaseByteArrayElements(env, a, p, JNI_ABORT);
    return ok;
}
