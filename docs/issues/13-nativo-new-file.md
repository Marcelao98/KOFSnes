**Title:** [Bug]: Native: `new File(p)` type-checks, then the link fails (`undefined reference to File_init_1`)

### Summary
Native: `new File(p)` type-checks, then the link fails (`undefined reference to File_init_1`). Possibly related: issue #760 / known-bugs entry on `File_init` (JVM side).

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/13-nativo-new-file`.

### Target
Native

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo nativo: `new File(p)` compila, mas o ld falha
// (undefined reference to `File_init_1`); `File(p)` sem `new` funciona
main() {
    println(new File("main.kf").exists())
}
```

### Command used
`kof build main.kf --target native --output o`

### Expected behavior
Either `new File(p)` lowers to the same constructor as `File(p)`, or the checker rejects it with a diagnostic.

### Actual behavior
`error: Error reading source file: ld failed (exit 1): … in function 'main': undefined reference to 'File_init_1'`.

### Kof intent and existing idiom
Creating a `File` value; `File(p)` (without `new`) works.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Target divergence — same valid Kof, different behavior across targets
