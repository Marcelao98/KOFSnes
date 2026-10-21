import dev.kofnes.android.Atualizador;
import java.io.*;
import java.nio.file.*;

// Testa o Atualizador do APK num Java comum, com um servidor falso no lugar do GitHub (o teste-atualizador.sh monta tudo):
// versão nova, nada novo, troca na abertura seguinte, núcleo com tamanho errado, casca nova, APK novo por cima, sem rede.
public class TesteAtualizador {
    static int falhas = 0;
    static void conferir(boolean ok, String msg) { System.out.println((ok ? "ok    " : "FALHA ") + msg); if (!ok) falhas++; }
    static void escrever(Path p, String s) throws IOException { Files.createDirectories(p.getParent()); Files.write(p, s.getBytes("UTF-8")); }

    public static void main(String[] a) throws Exception {
        final Path dir = Paths.get(a[0]), srv = dir.resolve("srv/publicado"), apk = dir.resolve("apk"), base = dir.resolve("app/web");
        String fonte = a[1];
        escrever(apk.resolve("versao.txt"), "versao=100\n"); escrever(apk.resolve("index.html"), "apk");
        escrever(apk.resolve("nucleos/a-11111111.js"), "AAAAA");
        escrever(srv.resolve("nucleos/b-22222222.js"), "BBBBBBB"); escrever(srv.resolve("android/KOFnes-android.html"), "pagina 200");
        String ver = "versao=200\ncasca=2\nhtml=KOFnes-android.html:10\nnucleo=a-11111111.js:5\nnucleo=b-22222222.js:7\n";
        escrever(srv.resolve("android/versao.txt"), ver);
        Atualizador.Embutidos emb = new Atualizador.Embutidos() {
            public InputStream abrir(String nome) throws IOException { return new FileInputStream(apk.resolve(nome).toFile()); }
        };
        Atualizador at = new Atualizador(base.toFile(), fonte, 2, emb);
        File r = at.raiz();
        conferir(r == null, "sem nada baixado: usa a página do APK");
        int x = at.atualizar(r);
        File pronta = base.resolve("pronta").toFile();
        conferir(x == Atualizador.NOVA && new File(pronta, "nucleos/a-11111111.js").length() == 5 && new File(pronta, "nucleos/b-22222222.js").length() == 7
                && new File(pronta, "index.html").length() == 10, "versão nova baixada pra 'pronta' (núcleo a copiado do APK, b baixado) " + x + " " + at.erro);
        conferir(at.atualizar(r) == Atualizador.NADA, "rodar de novo: nada a baixar");
        r = at.raiz();
        conferir(r != null && r.getName().equals("atual") && new String(Files.readAllBytes(r.toPath().resolve("index.html"))).equals("pagina 200"), "abertura seguinte: usa a versão baixada");
        conferir(at.atualizar(r) == Atualizador.NADA, "já na versão do servidor: nada a baixar");
        escrever(srv.resolve("android/versao.txt"), ver.replace("versao=200", "versao=300").replace("b-22222222.js:7", "b-22222222.js:8"));
        x = at.atualizar(r);
        conferir(x == Atualizador.FALHOU && !pronta.exists() && !base.resolve("baixando").toFile().exists(), "núcleo com tamanho errado: não troca nada (" + at.erro + ")");
        escrever(srv.resolve("android/versao.txt"), ver.replace("versao=200", "versao=300").replace("casca=2", "casca=3"));
        conferir(at.atualizar(r) == Atualizador.CASCA_NOVA && !pronta.exists(), "casca nova: pede APK novo e não baixa a página");
        escrever(apk.resolve("versao.txt"), "versao=400\n");
        r = at.raiz();
        conferir(r == null && !base.resolve("atual").toFile().exists(), "APK mais novo instalado por cima: volta pra página do APK");
        Atualizador semRede = new Atualizador(base.toFile(), "http://127.0.0.1:9/publicado/", 2, emb);
        conferir(semRede.atualizar(null) == Atualizador.FALHOU, "sem internet: falha quieta (" + semRede.erro + ")");
        System.out.println(falhas == 0 ? "tudo certo" : falhas + " falha(s)");
        System.exit(falhas == 0 ? 0 : 1);
    }
}
