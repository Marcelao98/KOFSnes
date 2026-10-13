**Title:** [Bug]: JVM: `for-in` rejects a `java.util.List` returned by a JDK method — `SEM058` with a String-oriented message

### Summary
JVM: `for-in` rejects a `java.util.List` returned by a JDK method — `SEM058` with a String-oriented message.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/06-for-in-lista-vinda-do-java`.

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
    var lines = Files.readAllLines(new File("main.kf").toPath())
    for (var s in lines) {
        println(s)
    }
}
```

### Command used
`kof run main.kf`

### Expected behavior
`for (var s in Files.readAllLines(p))` iterates, like `for-in` over `new ArrayList<String>()` already does.

### Actual behavior
`` main.kf:6:5: error: `for-in` only iterates over `List<T>` or arrays in Kof; for String use `s.charAt(i)` in a numeric loop [SEM058] `` — the value IS a `List<String>`; the hint about String is misleading.

### Kof intent and existing idiom
Iterating lines of a file. Workaround: `size()`/`get(i)` loop.

### Kof contract source
`docs/language-reference/statements.md` (for-in over List<T>)

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
