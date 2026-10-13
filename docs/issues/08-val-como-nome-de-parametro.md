**Title:** [Bug]: Diagnostics: `val` as a parameter name gives a 10-error cascade, no reserved-word hint

### Summary
Diagnostics: `val` as a parameter name gives a 10-error cascade, no reserved-word hint.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/08-val-como-nome-de-parametro`.

### Target
Unknown / all

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
class A {
    write(Int addr, Int val) {
        println(val)
    }
}

main() {
    A().write(1, 2)
}
```

### Command used
`kof run main.kf`

### Expected behavior
One diagnostic saying `val` is reserved, like `PARSE085` already does for `fn`.

### Actual behavior
`main.kf:2:25: error: Expected parameter name [PARSE023]`, `Expected ')' [PARSE012]` and more cascading errors.

### Kof intent and existing idiom
Naming a parameter `val` (common in other languages); the intent is just a name.

### Kof contract source
`docs/language-reference/lexical-structure.md` (reserved words)

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
