**Title:** [Bug]: JS (perf): `new Int[n]` emits `new Array(n).fill(0)` instead of `Int32Array`

### Summary
JS (perf): `new Int[n]` emits `new Array(n).fill(0)` instead of `Int32Array`. With `Int32Array` plus the `kofArrayGet/Set` fast paths, the KOFnes heaviest frame went from 60 to 91 fps. Note: helpers that use `Array.isArray` would need to accept typed arrays.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/19-js-int-array`.

### Target
JS

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo JS: new Int[n] vira new Array(n).fill(0), não Int32Array
//   kof build main.kf --target js --output o && grep -o "new [A-Za-z0-9]*Array([0-9]*)" o/Default.mjs
main() {
    var a = new Int[65536]
    a[1] = 0xFF000000
    println(a[1])
}
```

### Command used
`kof build main.kf --target js --output o && grep -o "new [A-Za-z0-9]*Array([0-9]*)" o/Default.mjs`

### Expected behavior
`new Int32Array(n)`: same JVM 32-bit wrap on store, monomorphic for V8.

### Actual behavior
`new Array(65536)` (generic array; values above 2^30 turn it into a double array).

### Kof intent and existing idiom
Compiling an existing, JVM-validated program for the browser with `--target js`.

### Kof contract source
performance

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
