**Title:** [Bug]: Native: `main(String[] args)` receives an empty array; `File(<procfs file>).readBytes()` returns empty

### Summary
Native: `main(String[] args)` receives an empty array; `File(<procfs file>).readBytes()` returns empty. (b) is probably `readBytes()` sizing the buffer from `st_size`, which is 0 for procfs/sysfs files and pipes; reading until EOF would fix it.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/12-nativo-argv-e-proc`.

### Target
Native

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
// alvo nativo: `main(String[] args)` recebe args vazio, e File().readBytes()
// de um arquivo do /proc (que diz ter tamanho 0) também volta vazio
//   kof run main.kf um dois                       -> args=2 (JVM)
//   kof build main.kf --target native --output o && ./o/Default/Main um dois
main(String[] args) {
    println("args=" + args.length)
    println("cmdline=" + File("/proc/self/cmdline").readBytes().length)
}
```

### Command used
`kof build main.kf --target native --output o && ./o/Default/Main um dois`

### Expected behavior
Same as JVM: `args=2` / `cmdline=290` (approx.).

### Actual behavior
`args=0` / `cmdline=0`.

### Kof intent and existing idiom
Reading command-line arguments (a ROM path) in a native executable. Workaround: libc `fopen`/`fread` on `/proc/self/cmdline` via `extern`.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Target divergence — same valid Kof, different behavior across targets
