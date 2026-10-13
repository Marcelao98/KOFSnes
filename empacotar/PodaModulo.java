import java.lang.classfile.*;
import java.lang.classfile.attribute.*;
import java.lang.classfile.constantpool.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

// Tira do module-info.class de um módulo extraído do Java as referências a
// pacotes que ficaram vazios depois da poda (exports, opens, uses, provides,
// lista de pacotes). Os .class já foram apagados antes, por quem chamou.
// Uso: java PodaModulo.java <dir-do-modulo> <pacote/interno>...
public class PodaModulo {
    static List<String> pref;

    static boolean fora(String pkgOuClasse) {
        return pref.contains(pkgOuClasse.replace('.', '/'));
    }

    static String pacoteDe(ClassEntry c) {
        String n = c.asInternalName();
        int i = n.lastIndexOf('/');
        return i < 0 ? "" : n.substring(0, i);
    }

    public static void main(String[] a) throws Exception {
        Path dir = Path.of(a[0]);
        pref = Arrays.asList(a).subList(1, a.length);
        Path mi = dir.resolve("module-info.class");
        ClassFile cf = ClassFile.of();
        ClassModel m = cf.parse(Files.readAllBytes(mi));
        byte[] out = cf.transformClass(m, (b, e) -> {
            if (e instanceof ModuleAttribute ma) {
                b.with(ModuleAttribute.of(ma.moduleName(), ma.moduleFlagsMask(), ma.moduleVersion().orElse(null),
                    ma.requires(),
                    ma.exports().stream().filter(x -> !fora(x.exportedPackage().name().stringValue())).toList(),
                    ma.opens().stream().filter(x -> !fora(x.openedPackage().name().stringValue())).toList(),
                    ma.uses().stream().filter(x -> !fora(pacoteDe(x))).toList(),
                    ma.provides().stream()
                        .filter(x -> !fora(pacoteDe(x.provides())))
                        .map(x -> ModuleProvideInfo.of(x.provides(),
                            x.providesWith().stream().filter(c -> !fora(pacoteDe(c))).toList()))
                        .filter(x -> !x.providesWith().isEmpty())
                        .toList()));
            } else if (e instanceof ModulePackagesAttribute mp) {
                b.with(ModulePackagesAttribute.of(mp.packages().stream()
                    .filter(p -> !fora(p.name().stringValue())).toList()));
            } else {
                b.with(e);
            }
        });
        Files.write(mi, out);
        System.out.println("module-info de " + dir.getFileName() + ": " + pref.size() + " pacotes vazios retirados");
    }
}
