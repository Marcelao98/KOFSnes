**Title:** [Bug]: JVM: unqualified self-method call inside a JDK constructor argument binds to `Default.Main` → `NoSuchMethodError`

### Summary
JVM: unqualified self-method call inside a JDK constructor argument binds to `Default.Main` → `NoSuchMethodError`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/03-metodo-como-argumento-de-construtor-jdk`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
class Caixa {
    String s
    public constructor(String s) { this.s = s }
}

class Janela {
    public constructor() { }
    abrir(String path) {
        println(Caixa(nome(path)).s)
        println(new StringBuilder(nome(path)).toString())
    }
    String nome(String s) {
        return s + ".srm"
    }
}

main() {
    Janela().abrir("jogo")
}
```

### Command used
`kof run main.kf`

### Expected behavior
`new StringBuilder(nome(p))` calls the instance method `nome` of the enclosing class.

### Actual behavior
`java.lang.NoSuchMethodError: 'java.lang.Object Default.Main.nome(java.lang.String)'` — resolved as a top-level function of `Main`, with an `Object` return.

### Kof intent and existing idiom
Calling an instance method of the current class without `this.`, which Kof allows everywhere else. Workaround: `this.nome(p)`.

### Kof contract source
`docs/language-reference/classes.md` (members are accessible without `this`) + `docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
