**Title:** [Bug]: JS (perf): every Int shift count goes through `Number(BigInt.asIntN(32, BigInt(n)))`

### Summary
JS (perf): every Int shift count goes through `Number(BigInt.asIntN(32, BigInt(n)))`. `JsOperatorEmitter` SHL/SHR/USHR always call `JsLongEmitter.toNumber32`. Fix in the KOFnes patch: literal counts as-is; side-effect-free counts as `typeof n === "bigint" ? … : n`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/18-js-shift-bigint`.

### Target
JS

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo JS: todo deslocamento de Int cria dois BigInt:
//   x >> 4  vira  x >> Number(BigInt.asIntN(32, BigInt(4)))
//   kof build main.kf --target js --output o && grep -c BigInt o/Default.mjs
main() {
    var x = 0x1234
    var s = 0
    var i = 0
    while (i < 1000000) {
        s = (s + ((x >> (i & 7)) & 0xFF)) & 0xFFFFFF
        i++
    }
    println(s)
}
```

### Command used
`kof build main.kf --target js --output o && grep BigInt o/Default.mjs`

### Expected behavior
Int shifts emit plain `x >> n` (JS already masks the count by 31, like the JVM).

### Actual behavior
`x >> Number(BigInt.asIntN(32, BigInt((i & 7))))` — two BigInt allocations per shift.

### Kof intent and existing idiom
Compiling an existing, JVM-validated program for the browser with `--target js`. Bit-heavy code (emulators, codecs, hashes).

### Kof contract source
performance; `docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
