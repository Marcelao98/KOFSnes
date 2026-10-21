package dev.kofnes.android;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Atualiza a página e os núcleos do app sem reinstalar o APK, igual ao lançador do PC. Lê publicado/android/versao.txt:
 *   versao=AAAAMMDDHHMM   casca=N   html=KOFnes-android.html:tamanho   nucleo=<arquivo>:<tamanho> (um por linha)
 * Baixa tudo numa pasta "baixando" (núcleo que já existe é copiado, não baixado: o nome tem o hash), confere os
 * tamanhos e só então vira "pronta". Na abertura seguinte, "pronta" vira "atual" e a página sai de lá. Se o APK
 * instalado for mais novo que a versão baixada, vale o do APK. Sem Android aqui dentro: dá pra testar num Java comum.
 */
public class Atualizador {
    /** Os arquivos que vieram dentro do APK (assets). */
    public interface Embutidos { InputStream abrir(String nome) throws IOException; }

    public static final int NOVA = 0, NADA = 1, CASCA_NOVA = 2, FALHOU = 3;
    private final File base;
    private final String fonte;
    private final int casca;
    private final Embutidos apk;
    public String erro = "";

    public Atualizador(File base, String fonte, int casca, Embutidos apk) {
        this.base = base; this.fonte = fonte.endsWith("/") ? fonte : fonte + "/"; this.casca = casca; this.apk = apk;
    }

    /** Antes de abrir a página: a pasta da versão baixada (se for mais nova que a do APK) ou null (usa a do APK). */
    public File raiz() {
        File atual = new File(base, "atual"), pronta = new File(base, "pronta");
        if (new File(pronta, "versao.txt").isFile()) { apagar(atual); if (!pronta.renameTo(atual)) apagar(pronta); }
        long doApk = versao(textoEmbutido("versao.txt")), baixada = versao(texto(new File(atual, "versao.txt")));
        if (baixada > doApk && new File(atual, "index.html").isFile()) return atual;
        apagar(atual);   // APK novo instalado por cima: a versão de dentro dele é a mais nova
        return null;
    }

    /** Em segundo plano. raizAtual = a pasta que a página está usando agora (null = a do APK). */
    public int atualizar(File raizAtual) {
        try {
            String txt = new String(baixar(fonte + "android/versao.txt"), "UTF-8");
            if (campo(txt, "casca") > casca) return CASCA_NOVA;   // a página nova pode precisar de um Java novo: só com APK novo
            long nova = versao(txt), agora = Math.max(versao(textoEmbutido("versao.txt")),
                    raizAtual == null ? 0 : versao(texto(new File(raizAtual, "versao.txt"))));
            File pronta = new File(base, "pronta");
            if (nova <= agora || nova <= versao(texto(new File(pronta, "versao.txt")))) return NADA;
            File b = new File(base, "baixando");
            apagar(b);
            if (!new File(b, "nucleos").mkdirs()) throw new IOException("não consegui criar " + b);
            List<String[]> nucleos = new ArrayList<String[]>();
            String[] html = null;
            for (String l : txt.split("\n")) {
                l = l.trim();
                if (l.startsWith("nucleo=")) nucleos.add(l.substring(7).split(":"));
                else if (l.startsWith("html=")) html = l.substring(5).split(":");
            }
            if (html == null || html.length != 2) throw new IOException("versao.txt sem a linha html=");
            for (String[] n : nucleos) {
                if (n.length != 2 || n[0].contains("/") || n[0].contains("..")) throw new IOException("linha de núcleo estranha");
                File dest = new File(b, "nucleos/" + n[0]);
                long tam = Long.parseLong(n[1]);
                if (!(raizAtual != null && copiar(new File(raizAtual, "nucleos/" + n[0]), dest, tam))
                        && !copiarEmbutido("nucleos/" + n[0], dest, tam)) gravar(dest, baixar(fonte + "nucleos/" + n[0]), tam);
            }
            gravar(new File(b, "index.html"), baixar(fonte + "android/" + html[0]), Long.parseLong(html[1]));
            gravar(new File(b, "versao.txt"), txt.getBytes("UTF-8"), -1);   // por último: sem ele a pasta não vale
            apagar(pronta);
            if (!b.renameTo(pronta)) throw new IOException("não consegui trocar a pasta");
            return NOVA;
        } catch (Exception e) {
            erro = String.valueOf(e.getMessage());
            apagar(new File(base, "baixando"));
            return FALHOU;
        }
    }

    // ---------- ajudantes ----------
    static long versao(String txt) { return campo(txt, "versao"); }

    static long campo(String txt, String nome) {
        if (txt == null) return 0;
        for (String l : txt.split("\n")) {
            l = l.trim();
            if (l.startsWith(nome + "=")) try { return Long.parseLong(l.substring(nome.length() + 1).trim()); } catch (NumberFormatException e) { return 0; }
        }
        return 0;
    }

    private String textoEmbutido(String nome) {
        try { return new String(ler(apk.abrir(nome)), "UTF-8"); } catch (Exception e) { return null; }
    }

    private static String texto(File f) {
        try { return f.isFile() ? new String(ler(new FileInputStream(f)), "UTF-8") : null; } catch (Exception e) { return null; }
    }

    private static byte[] baixar(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000); c.setReadTimeout(30000); c.setUseCaches(false);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode() + " em " + url);
            return ler(c.getInputStream());
        } finally { c.disconnect(); }
    }

    private static byte[] ler(InputStream in) throws IOException {
        try {
            java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
            return o.toByteArray();
        } finally { in.close(); }
    }

    private static void gravar(File f, byte[] dados, long tam) throws IOException {
        if (tam >= 0 && dados.length != tam) throw new IOException(f.getName() + " veio com " + dados.length + " bytes, esperava " + tam);
        OutputStream o = new FileOutputStream(f);
        try { o.write(dados); } finally { o.close(); }
    }

    private static boolean copiar(File de, File para, long tam) {
        try { return de.isFile() && de.length() == tam && copiarStream(new FileInputStream(de), para, tam); } catch (IOException e) { return false; }
    }

    private boolean copiarEmbutido(String nome, File para, long tam) {
        try { return copiarStream(apk.abrir(nome), para, tam); } catch (IOException e) { return false; }
    }

    private static boolean copiarStream(InputStream in, File para, long tam) throws IOException {
        byte[] d = ler(in);
        if (d.length != tam) return false;
        gravar(para, d, tam);
        return true;
    }

    static void apagar(File f) {
        File[] fs = f.listFiles();
        if (fs != null) for (File x : fs) apagar(x);
        f.delete();
    }
}
