**Title:** [Bug]: JVM: Java method returning a non-String object array (`StackTraceElement[]`) → `NoClassDefFoundError: ?`

### Summary
JVM: Java method returning a non-String object array (`StackTraceElement[]`) → `NoClassDefFoundError: ?`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/11-array-java-de-objetos`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
main() {
    var e = new RuntimeException("x")
    var pilha = e.getStackTrace()
    println(pilha.length)
}
```

### Command used
`kof run main.kf`

### Expected behavior
`new RuntimeException("x").getStackTrace().length` prints the length (as `String[]` from `File.list()` already does).

### Actual behavior
`kof run: could not load main class Default.Main` / `java.lang.NoClassDefFoundError: ?` — the element type has no name in the bytecode.

### Kof intent and existing idiom
Using the JDK through Kof's Java interop (`import java.…`), which Kof supports and documents; no Kof stdlib API covers this case. No workaround found.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
