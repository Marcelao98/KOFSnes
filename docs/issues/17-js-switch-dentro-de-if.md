**Title:** [Bug]: JS (silent miscompile): `switch` inside `if`, all arms `return` → code after the `if` lands inside it

### Summary
JS (silent miscompile): `switch` inside `if`, all arms `return` → code after the `if` lands inside it. Cause: with every arm returning there is no own end label, and the trailing `if (KofLabel) pos++` in `parseSwitchStatement` consumes the enclosing `if`'s false label. Fix (verified on 0.6.4 with the KOFnes patch): do not consume a label that is an enclosing if-false.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/17-js-switch-dentro-de-if`.

### Target
JS

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo JS: switch dentro de if, todos os case terminando em return, e código
// depois do if. Compila sem erro, mas o código depois do if vai parar DENTRO
// do if: ler(100) devolve undefined.
//   kof run main.kf                                  -> 7 9 100
//   kof build main.kf --target js --output o && node o/Default.mjs
Int ler(Int a) {
    if (a >= 1 && a <= 2) {
        switch (a) {
            case 1: return 7
            case 2: return 9
            default: return 0
        }
    }
    return a
}

main() {
    println(ler(1) + " " + ler(2) + " " + ler(100))
}
```

### Command used
`kof build main.kf --target js --output o && node o/Default.mjs`

### Expected behavior
`7 9 100` (JVM).

### Actual behavior
`7 9 undefined` — no diagnostic. In the emulator, `Apu.read()` returned `undefined` for every address outside $F0–$FF; the SPC700 ran 55M instructions per frame (0.3 fps).

### Kof intent and existing idiom
Compiling an existing, JVM-validated program for the browser with `--target js`.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Target divergence — same valid Kof, different behavior across targets
