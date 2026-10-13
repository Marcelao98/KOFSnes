**Title:** [Bug]: JVM: every class gets the entry file as `SourceFile` → stack traces point to the wrong file

### Summary
JVM: every class gets the entry file as `SourceFile` → stack traces point to the wrong file.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/07-sourcefile-errado`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
import app

main() {
    println(Conta().dividir(1, 0))
}
```

### Command used
`kof run main.kf`

### Expected behavior
The exception thrown in `app/Conta.kf:6` shows `Conta.kf:6`.

### Actual behavior
`at app.Conta.dividir(main.kf:6)` — the file name is the entry file of the module.

### Kof intent and existing idiom
Debugging a multi-file module.

### Kof contract source
debuggability; no explicit contract found — classify during triage

### Classification (D-KOF-FIRST Gate 4)
Contract ambiguity — docs/decisions/tests do not settle the behavior
