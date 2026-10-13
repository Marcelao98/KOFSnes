import java.lang.classfile.*;
import java.lang.classfile.attribute.ModuleHashesAttribute;
import java.nio.file.*;

// remove o atributo ModuleHashes de um module-info.class
public class TiraHashes {
    public static void main(String[] a) throws Exception {
        Path p = Path.of(a[0]);
        ClassFile cf = ClassFile.of();
        ClassModel m = cf.parse(Files.readAllBytes(p));
        byte[] out = cf.transformClass(m, (b, e) -> {
            if (!(e instanceof ModuleHashesAttribute)) b.with(e);
        });
        Files.write(p, out);
        System.out.println("ok: " + p);
    }
}
