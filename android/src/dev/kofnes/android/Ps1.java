package dev.kofnes.android;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * PlayStation nativo: as funções da ponte em C (android/nativo/kofps1.c), que liga o PCSX-ReARMed compilado pra ARM64
 * (com o recompilador) ao app. A imagem (RGBA) e o som (16 bits estéreo) chegam em buffers diretos, sem cópia.
 * Sem nada de Android aqui dentro: o teste (testes/android/ps1-nativo.sh) roda esta classe num Java comum no Linux.
 */
public final class Ps1 {
    public static final ByteBuffer VIDEO = ByteBuffer.allocateDirect(1024 * 512 * 4).order(ByteOrder.nativeOrder());
    public static final ByteBuffer SOM = ByteBuffer.allocateDirect(48000 * 2 * 2).order(ByteOrder.nativeOrder());
    private static boolean pronto;

    /** Carrega a ponte (no Android pelo nome; no teste, pelo caminho do arquivo). Falhou = o app usa o WebAssembly. */
    public static synchronized boolean carregar(String caminho) {
        if (pronto) return true;
        try {
            if (caminho == null) System.loadLibrary("kofps1"); else System.load(caminho);
            buffers(VIDEO, SOM);
            pronto = true;
        } catch (Throwable t) {
            pronto = false;
        }
        return pronto;
    }

    static native void buffers(ByteBuffer video, ByteBuffer som);
    /** "" = abriu; senão o motivo. info = largura, altura, fps×1000, taxa do som. */
    static native String abrir(String jogo, String sistema, String saves, String cartao, String opcoes, int[] info);
    /** Um quadro com os botões (bits do libretro); devolve quantas amostras de som (int16) vieram. */
    static native int rodar(int pad);
    /** Largura do quadro novo (0 = este quadro repetiu o anterior). */
    static native int largura();
    static native int altura();
    static native void reiniciar();
    static native boolean gravarCartao();
    static native void fechar();
    static native byte[] salvarEstado();
    static native boolean carregarEstado(byte[] estado);
}
