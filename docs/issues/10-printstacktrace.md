**Title:** [Bug]: JVM: `Throwable.printStackTrace()` emitted with an `Object` return → `NoSuchMethodError` / `VerifyError`

### Summary
JVM: `Throwable.printStackTrace()` emitted with an `Object` return → `NoSuchMethodError` / `VerifyError`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/10-printstacktrace`.

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
    e.printStackTrace()
    try {
        println("dentro")
    } catch (Exception x) {
        println("pegou")
    }
    println("fim")
}
```

### Command used
`kof run main.kf`

### Expected behavior
`e.printStackTrace()` prints the stack trace.

### Actual behavior
`java.lang.VerifyError: Inconsistent stackmap frames at branch target 43` (a `try` follows in the same method); without the `try`: `NoSuchMethodError: 'java.lang.Object java.lang.RuntimeException.printStackTrace()'`.

### Kof intent and existing idiom
Using the JDK through Kof's Java interop (`import java.…`), which Kof supports and documents; no Kof stdlib API covers this case. Workaround: `System.err.println(e.toString())`.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
