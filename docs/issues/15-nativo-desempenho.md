**Title:** [Bug]: Native x86-64: stack-machine codegen ~13× slower than JVM; `--release` does not change it

### Summary
Native x86-64: stack-machine codegen ~13× slower than JVM; `--release` does not change it. Cheapest wins, in order: peephole `push X; pop Y` → `mov`; inline array get/set when the element type is static; keep locals in registers; make `--release` mean something.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/15-nativo-desempenho`.

### Target
Native

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// mesmo laço no JVM e no nativo: kof run main.kf  vs  --target native
// (o nativo gera código de pilha: cada operação faz push/pop, sem registradores)
main() {
    var a = new Int[65536]
    var t0 = time.now()
    var soma = 0
    var r = 0
    while (r < 2000) {
        var i = 0
        while (i < 65536) {
            a[i] = (a[i] + i * 3) & 0xFFFF
            soma = (soma + a[i]) & 0x7FFFFFFF
            i++
        }
        r++
    }
    println("soma=" + soma + " ms=" + (time.now() - t0))
}
```

### Command used
`kof build main.kf --target native [--release] --output o && ./o/Default/Main   vs   kof run main.kf`

### Expected behavior
Native in the same order of magnitude as JVM for a tight `Int[]` loop.

### Actual behavior
Same output (`soma=1783103488`), **1899 ms native vs 147 ms JVM** on 0.6.4. A full SNES emulator runs at ~22 fps native vs 350–500 fps JVM. Disassembly: every subexpression is `push`/`pop`, locals live in memory, every array access is `call kof_array_get/set` with a runtime element-width check.

### Kof intent and existing idiom
CPU-bound integer code (emulator).

### Kof contract source
performance; no explicit contract — classify during triage

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
