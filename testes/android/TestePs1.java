import dev.kofnes.android.Ps1;
import java.lang.reflect.Method;
import java.nio.file.*;

// Testa a ponte nativa do PS1 (kofps1.c + Ps1.java) num Java comum: a mesma ponte compilada pro Linux com o PCSX do
// Linux (com o interpretador: o recompilador do PC, lightrec, reserva endereços fixos que brigam com a JVM; o do
// celular é outro, o ari64). Abre um programa de PS1 livre, roda quadros, confere imagem, som, savestate (volta igual) e o cartão de memória.
public class TestePs1 {
    static int falhas = 0;
    static void conferir(boolean ok, String msg) { System.out.println((ok ? "ok    " : "FALHA ") + msg); if (!ok) falhas++; }
    static Object chamar(String nome, Object... a) throws Exception {
        for (Method m : Ps1.class.getDeclaredMethods()) if (m.getName().equals(nome)) { m.setAccessible(true); return m.invoke(null, a); }
        throw new RuntimeException(nome);
    }
    public static void main(String[] a) throws Exception {
        String ponte = a[0], jogo = a[1], dir = a[2];
        conferir(Ps1.carregar(ponte), "ponte carregada");
        int[] info = new int[4];
        String erro = (String) chamar("abrir", jogo, dir, dir, dir + "/cartao1.mcd", "pcsx_rearmed_drc=disabled\n", info);
        conferir(erro.isEmpty(), "abriu " + Paths.get(jogo).getFileName() + " " + erro + " (" + info[0] + "x" + info[1] + ", " + info[2] / 1000.0 + " fps, som " + info[3] + " Hz)");
        long t = System.nanoTime(); int amostras = 0, quadros = 0, w = 0, h = 0;
        for (int i = 0; i < 300; i++) { amostras += (Integer) chamar("rodar", 0); int l = (Integer) chamar("largura"); if (l > 0) { quadros++; w = l; h = (Integer) chamar("altura"); } }
        double ms = (System.nanoTime() - t) / 1e6 / 300;
        java.util.HashSet<Integer> cores = new java.util.HashSet<>();
        for (int i = 0; i < w * h; i += 7) cores.add(Ps1.VIDEO.getInt(i * 4));
        conferir(quadros > 200 && cores.size() > 20, "imagem: " + quadros + " quadros novos de 300, " + w + "x" + h + ", " + cores.size() + " cores");
        conferir(amostras > 300 * 1000, "som: " + amostras / 300 + " amostras por quadro");
        conferir(true, String.format("%.2f ms por quadro aqui", ms));
        byte[] e = (byte[]) chamar("salvarEstado");
        for (int i = 0; i < 30; i++) chamar("rodar", 0);
        int img1 = Ps1.VIDEO.getInt(w * h / 2 * 4);
        conferir(e != null && e.length > 100000 && (Boolean) chamar("carregarEstado", (Object) e), "savestate guarda e volta (" + (e == null ? 0 : e.length) + " bytes)");
        for (int i = 0; i < 30; i++) chamar("rodar", 0);
        conferir(Ps1.VIDEO.getInt(w * h / 2 * 4) == img1, "depois de voltar o estado, o mesmo quadro de novo (determinístico)");
        chamar("fechar");
        conferir(true, "fechou");
        System.out.println(falhas == 0 ? "tudo certo" : falhas + " falha(s)");
        System.exit(falhas == 0 ? 0 : 1);
    }
}
