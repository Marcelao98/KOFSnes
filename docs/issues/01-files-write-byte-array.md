**Title:** [Bug]: JVM: `Files.write(Path, Byte[])` picks the `Iterable` overload → `VerifyError` at load

### Summary
JVM: `Files.write(Path, Byte[])` picks the `Iterable` overload → `VerifyError` at load. Likely cause: `toJavaClass` has no case for array types, so `byte[]` and `Iterable` tie in overload scoring and the first in `getMethods()` wins.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/01-files-write-byte-array`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
import java.io.File;
import java.nio.file.Files;

main() {
    var b = new Byte[3]
    b[0] = 75 as Byte
    b[1] = 79 as Byte
    b[2] = 70 as Byte
    Files.write(new File("saida.bin").toPath(), b)
    println("ok")
}
```

### Command used
`kof run main.kf`

### Expected behavior
The program writes the file (`write(Path, byte[], OpenOption...)` is chosen).

### Actual behavior
`kof run: could not load main class Default.Main` / `java.lang.VerifyError: Bad type on operand stack` — the whole class is rejected before `main` runs.

### Kof intent and existing idiom
Using the JDK through Kof's Java interop (`import java.…`), which Kof supports and documents; no Kof stdlib API covers this case. Workaround used: `FileOutputStream.write(bytes, 0, n)`.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
