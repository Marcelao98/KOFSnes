package dev.kofnes.android;

import android.app.Activity;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Rect;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * O PlayStation nativo na tela: o CD escolhido é copiado (ou extraído do zip) pra pasta do app, o PCSX roda numa thread
 * própria, a imagem vai pra uma SurfaceView por cima da área do jogo da página e o som sai por um AudioTrack (que também
 * marca o ritmo). A página continua com os menus e o controle de toque: ela manda os botões a cada quadro (ps1Pad), e
 * isso é também o "estou jogando": sem notícia por 250 ms (menu aberto, jogo pausado), a emulação para e a tela some.
 */
final class Ps1Jogo implements Runnable {
    private final Activity a;
    private final SurfaceView tela;
    private final File pasta, saves, sistema;
    private final Object trava = new Object();
    private volatile int pad, largura = 320, altura = 240;
    private volatile long ultimoSinal;
    private volatile boolean aberto, visivel;
    private volatile float volume = 1f;
    private Thread laco;
    private AudioTrack som;
    private Bitmap quadro;
    Uri[] ultimaEscolha;

    Ps1Jogo(Activity a, FrameLayout raiz) {
        this.a = a;
        pasta = new File(a.getFilesDir(), "ps1-cd");
        saves = new File(a.getFilesDir(), "ps1-saves");
        sistema = new File(a.getFilesDir(), "ps1-sistema");
        saves.mkdirs(); sistema.mkdirs();
        tela = new SurfaceView(a);
        tela.setZOrderMediaOverlay(true);
        tela.setVisibility(View.GONE);
        raiz.addView(tela, new FrameLayout.LayoutParams(1, 1));
    }

    // ---------- abrir o CD ----------
    /** Copia o que o usuário escolheu (ou extrai o zip) e abre o jogo. Devolve JSON {principal, largura, ...} ou {erro}. */
    String abrir(String nome) {
        try {
            File principal = null;
            Uri[] es = ultimaEscolha;
            boolean escolhido = false;
            if (es != null) for (Uri u : es) if (nome.equalsIgnoreCase(nomeDe(u))) escolhido = true;
            if (escolhido) {
                apagar(pasta); pasta.mkdirs();
                for (Uri u : es) {
                    String n = nomeDe(u);
                    if (n.toLowerCase().endsWith(".zip")) extrair(u);
                    else copiar(a.getContentResolver().openInputStream(u), new File(pasta, n));
                }
                principal = escolherPrincipal(nome);
            } else if (new File(pasta, nome).isFile()) principal = new File(pasta, nome);   // da biblioteca: o último CD aberto
            if (principal == null) return "{\"erro\":\"abra o arquivo do jogo de novo (de PlayStation, o .cue junto com os .bin, ou o .zip)\"}";
            String base = principal.getName().replaceAll("\\.[^.]+$", "");
            int[] info = new int[4];
            String erro;
            synchronized (trava) {
                erro = Ps1.abrir(principal.getAbsolutePath(), sistema.getAbsolutePath(), saves.getAbsolutePath(),
                        new File(saves, base + ".mcd").getAbsolutePath(), "pcsx_rearmed_drc=enabled\npcsx_rearmed_frameskip_type=disabled\n", info);
            }
            if (!erro.isEmpty()) return "{\"erro\":\"" + erro + "\"}";
            iniciarSom(info[3] > 0 ? info[3] : 44100);
            aberto = true;
            if (laco == null) { laco = new Thread(this, "KOFps1"); laco.setPriority(Thread.MAX_PRIORITY); laco.start(); }
            return "{\"principal\":\"" + principal.getName().replace("\"", "") + "\",\"largura\":" + info[0] + ",\"altura\":" + info[1]
                    + ",\"fps\":" + info[2] / 1000.0 + ",\"taxa\":" + info[3] + "}";
        } catch (Exception e) {
            return "{\"erro\":\"não consegui preparar o CD: " + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
        }
    }

    private File escolherPrincipal(String nome) {
        File[] fs = pasta.listFiles();
        if (fs == null) return null;
        File porNome = new File(pasta, nome);
        if (porNome.isFile() && !nome.toLowerCase().endsWith(".zip") && !nome.toLowerCase().matches(".*\\(track [2-9]\\d*\\)\\.bin")) return porNome;
        for (String ext : new String[]{".cue", ".chd", ".pbp", ".iso", ".bin", ".img"}) {
            File melhor = null;
            for (File f : fs) if (f.getName().toLowerCase().endsWith(ext) && (melhor == null || f.getName().compareToIgnoreCase(melhor.getName()) < 0)) melhor = f;
            if (melhor != null) return melhor;
        }
        return null;
    }

    private void extrair(Uri u) throws Exception {
        ZipInputStream z = new ZipInputStream(a.getContentResolver().openInputStream(u));
        try {
            for (ZipEntry e; (e = z.getNextEntry()) != null; ) {
                if (e.isDirectory()) continue;
                String n = e.getName().replaceAll("^.*[\\\\/]", "");
                if (n.isEmpty()) continue;
                OutputStream o = new FileOutputStream(new File(pasta, n));
                byte[] b = new byte[1 << 16];
                for (int k; (k = z.read(b)) > 0; ) o.write(b, 0, k);
                o.close();
            }
        } finally { z.close(); }
    }

    private static void copiar(InputStream in, File destino) throws Exception {
        OutputStream o = new FileOutputStream(destino);
        try { byte[] b = new byte[1 << 16]; for (int k; (k = in.read(b)) > 0; ) o.write(b, 0, k); }
        finally { o.close(); in.close(); }
    }

    private String nomeDe(Uri u) {
        Cursor c = null;
        try {
            c = a.getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) { /* sem nome */ } finally { if (c != null) c.close(); }
        String p = u.getLastPathSegment();
        return p == null ? "" : p.replaceAll("^.*[\\\\/]", "");
    }

    private static void apagar(File f) {
        File[] fs = f.listFiles();
        if (fs != null) for (File x : fs) apagar(x);
        f.delete();
    }

    // ---------- o que a página manda ----------
    void sinal(int botoes) { pad = botoes; ultimoSinal = SystemClock.uptimeMillis(); }

    /** Área do jogo na página (px do CSS); a tela nativa fica exatamente em cima dela. */
    void area(final float x, final float y, final float w, final float h) {
        final float d = a.getResources().getDisplayMetrics().density;
        a.runOnUiThread(new Runnable() { public void run() {
            FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(Math.max(1, Math.round(w * d)), Math.max(1, Math.round(h * d)));
            p.leftMargin = Math.round(x * d); p.topMargin = Math.round(y * d);
            tela.setLayoutParams(p);
        } });
    }

    void fechar() {
        aberto = false;
        synchronized (trava) { Ps1.fechar(); }
        mostrar(false);
    }

    void reiniciar() { synchronized (trava) { Ps1.reiniciar(); } }
    void volume(float v) { volume = v; if (som != null) som.setStereoVolume(v, v); }

    String estado() {
        byte[] e;
        synchronized (trava) { e = Ps1.salvarEstado(); }
        return e == null ? "" : Base64.encodeToString(e, Base64.NO_WRAP);
    }

    boolean carregarEstado(String b64) {
        byte[] e = Base64.decode(b64, Base64.DEFAULT);
        synchronized (trava) { return Ps1.carregarEstado(e); }
    }

    void pausar() { synchronized (trava) { Ps1.gravarCartao(); } }

    // ---------- o laço da emulação ----------
    private void iniciarSom(int taxa) {
        if (som != null) { som.release(); som = null; }
        int min = AudioTrack.getMinBufferSize(taxa, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        som = new AudioTrack(AudioManager.STREAM_MUSIC, taxa, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT,
                Math.max(min, taxa * 4 / 12), AudioTrack.MODE_STREAM);   // ~80 ms
        som.setStereoVolume(volume, volume);
        som.play();
    }

    private void mostrar(final boolean sim) {
        if (visivel == sim) return;
        visivel = sim;
        a.runOnUiThread(new Runnable() { public void run() { tela.setVisibility(sim ? View.VISIBLE : View.GONE); } });
    }

    public void run() {
        short[] amostras = new short[48000];
        Rect src = new Rect(), dst = new Rect();
        while (true) {
            boolean jogando = aberto && SystemClock.uptimeMillis() - ultimoSinal < 250;
            mostrar(jogando);
            if (!jogando) { SystemClock.sleep(20); continue; }
            int n, w, h;
            synchronized (trava) {
                n = Ps1.rodar(pad);
                w = Ps1.largura(); h = Ps1.altura();
                if (w > 0) {
                    if (quadro == null || quadro.getWidth() != w || quadro.getHeight() != h) quadro = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    Ps1.VIDEO.rewind();
                    quadro.copyPixelsFromBuffer(Ps1.VIDEO);
                    largura = w; altura = h;
                }
                if (n > 0) { Ps1.SOM.rewind(); Ps1.SOM.asShortBuffer().get(amostras, 0, Math.min(n, amostras.length)); }
            }
            if (w > 0) desenhar(src, dst);
            if (n > 0 && som != null) som.write(amostras, 0, n);   // bloqueia até caber: é isso que segura os 60 quadros por segundo
            else SystemClock.sleep(16);
        }
    }

    private void desenhar(Rect src, Rect dst) {
        SurfaceHolder s = tela.getHolder();
        Canvas c = null;
        try {
            c = s.lockCanvas();
            if (c == null) return;
            c.drawColor(Color.BLACK);
            int W = c.getWidth(), H = c.getHeight(), w = W, h = W * 3 / 4;   // 4:3, como na TV
            if (h > H) { h = H; w = H * 4 / 3; }
            src.set(0, 0, largura, altura);
            dst.set((W - w) / 2, (H - h) / 2, (W + w) / 2, (H + h) / 2);
            c.drawBitmap(quadro, src, dst, null);
        } catch (Exception e) { /* superfície sumiu no meio */ } finally {
            if (c != null) try { s.unlockCanvasAndPost(c); } catch (Exception e) { /* idem */ }
        }
    }
}
