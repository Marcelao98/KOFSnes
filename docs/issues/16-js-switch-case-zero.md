**Title:** [Bug]: JS: `switch` whose first arm is `case 0` (fused compare) and whose arms end in `if (…) { return }` + `return` → `COMP002`

### Summary
JS: `switch` whose first arm is `case 0` (fused compare) and whose arms end in `if (…) { return }` + `return` → `COMP002`. Two shapes in `JsSwitchParser`: (a) the `case 0` arm arrives fused as a two-operand `CJump(EQ)` (no `SUB`); (b) a body ending in `return` has no `Jump(end)`, so the body parse swallows the next arms (`switch body label missing`). The patch in KOFnes (`web/kof-js-correcoes.patch`) fixes (a) and part of (b); on this exact repro it still ends in `switch body label missing` — (b) needs the next-arm labels honoured by every nested parse. Related: §343 (same ICE text, different shape, already fixed).

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/16-js-switch-case-zero`.

### Target
JS

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo JS: switch cujo primeiro case é 0 (o arm vira um salto fundido) e
// cujos corpos terminam em if + return -> COMP002 no kof build --target js
//   kof run main.kf                         -> 2 0 4 8
//   kof build main.kf --target js --output o -> Internal compiler error
Int bpp(Int modo, Int n) {
    switch (modo) {
        case 0: return 2
        case 1:
            if (n == 3) { return 0 }
            return 4
        case 2:
            if (n == 0) { return 8 }
            return 0
        default: return 0
    }
}

main() {
    println(bpp(0, 0) + " " + bpp(1, 3) + " " + bpp(1, 0) + " " + bpp(2, 0))
}
```

### Command used
`kof build main.kf --target js --output o`

### Expected behavior
Compiles; prints `2 0 4 8` like JVM.

### Actual behavior
`Internal compiler error: KofJS: unexpected op in switch case: KofConditionalJump[comparison=EQ, …] [COMP002]`.

### Kof intent and existing idiom
Compiling an existing, JVM-validated program for the browser with `--target js`. Workaround used: replace the switch by a lookup table.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Target divergence — same valid Kof, different behavior across targets
