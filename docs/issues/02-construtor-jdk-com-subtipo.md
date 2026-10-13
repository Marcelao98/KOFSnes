**Title:** [Bug]: JVM: JDK constructor called with a subtype argument → `NoSuchMethodError` (`BufferedReader(FileReader)`, `ZipInputStream(FileInputStream)`)

### Summary
JVM: JDK constructor called with a subtype argument → `NoSuchMethodError` (`BufferedReader(FileReader)`, `ZipInputStream(FileInputStream)`). Second repro in the same folder set: `02b-bufferedreader-filereader`. The constructor resolver seems to scan `getMethods()` (no constructors) and fall back to the argument static types.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/02-construtor-jdk-com-subtipo`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
import java.io.FileInputStream;
import java.util.zip.ZipInputStream;

main() {
    var z = new ZipInputStream(new FileInputStream("main.kf"))
    println(z.getNextEntry())
}
```

### Command used
`kof run main.kf`

### Expected behavior
The constructor declared with the supertype (`Reader`, `InputStream`) is invoked, as javac does.

### Actual behavior
`java.lang.NoSuchMethodError: 'void java.util.zip.ZipInputStream.<init>(java.io.FileInputStream)'` (and `BufferedReader.<init>(java.io.FileReader)` for `02b-bufferedreader-filereader`). The descriptor uses the static type of the argument.

### Kof intent and existing idiom
Using the JDK through Kof's Java interop (`import java.…`), which Kof supports and documents; no Kof stdlib API covers this case. Workaround used: cast to the declared type, e.g. `new FileReader(f) as Reader`.

### Kof contract source
`docs/backend-parity.md` §Principle — "Kof semantics are the same on all targets … never code that works differently or breaks silently"

### Classification (D-KOF-FIRST Gate 4)
Real bug — valid Kof diverges from Kof's own contract
