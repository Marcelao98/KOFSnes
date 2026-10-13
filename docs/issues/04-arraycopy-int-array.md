**Title:** [Bug]: JVM: `Int[]` not accepted for an `Object` parameter of an external method (`System.arraycopy`) — `SEM014`

### Summary
JVM: `Int[]` not accepted for an `Object` parameter of an external method (`System.arraycopy`) — `SEM014`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/04-arraycopy-int-array`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
import java.lang.System;

main() {
    var a = new Int[4]
    var b = new Int[4]
    a[0] = 7
    System.arraycopy(a, 0, b, 0, 4)
    println(b[0])
}
```

### Command used
`kof run main.kf`

### Expected behavior
An `Int[]` (a JVM `int[]`) is accepted where the Java signature takes `Object`.

### Actual behavior
`main.kf:7:22: error: Argument 1 of 'arraycopy': expected 'Object' but got 'Int[]' [SEM014]`

### Kof intent and existing idiom
Bulk copy between `Int[]` arrays (hot path in an emulator). Workaround: manual loop.

### Kof contract source
`docs/language-reference/types.md` (arrays) + Java interop

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
