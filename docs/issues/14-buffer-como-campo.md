**Title:** [Bug]: `Buffer(U8)` is rejected as a class field type (`PARSE023` + `PARSE018`)

### Summary
`Buffer(U8)` is rejected as a class field type (`PARSE023` + `PARSE018`).

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/14-buffer-como-campo`.

### Target
Unknown / all

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// Buffer(U8) vale como tipo de parâmetro de extern, mas não como tipo de
// campo: PARSE023 "Expected parameter name" + PARSE018 em cascata
class Tela {
    Buffer(U8) px
    public constructor() { this.px = buffer.alloc(16) }
}

main() {
    var t = Tela()
    println("ok")
}
```

### Command used
`kof build main.kf --target native --output o`

### Expected behavior
A field of type `Buffer(U8)` parses, as it does for `extern` parameters.

### Actual behavior
`error: Expected parameter name [PARSE023]` then `Expected member name [PARSE018]`.

### Kof intent and existing idiom
Keeping an FFI pixel/audio buffer in an object (SDL frontend). Workaround: `Long` field holding a libc `malloc` address + raw `buffer.peek/poke(addr)`.

### Kof contract source
`docs/ffi-abi-structs.md` (`Buffer(U8)`, D6-3)

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
