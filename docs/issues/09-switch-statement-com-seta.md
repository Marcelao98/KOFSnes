**Title:** [Bug]: Diagnostics: `case 1 -> { … }` in a switch statement gives a self-contradictory message

### Summary
Diagnostics: `case 1 -> { … }` in a switch statement gives a self-contradictory message.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/09-switch-statement-com-seta`.

### Target
Unknown / all

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
main() {
    var x = 1
    switch (x) {
        case 0 -> { println("zero") }
        case 1 -> { println("um") }
        default -> { println("outro") }
    }
}
```

### Command used
`kof run main.kf`

### Expected behavior
A hint like "`->` with a block is only valid in a switch expression; use `case 1:` in a statement".

### Actual behavior
`main.kf:4:16: error: expected ':' (switch statement) or '->' (switch expression) [PARSE073]` while `->` is right there, then `PARSE041`.

### Kof intent and existing idiom
Writing a switch statement with arrow arms.

### Kof contract source
`docs/language-reference/statements.md` §6 `switch` (statement)

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
