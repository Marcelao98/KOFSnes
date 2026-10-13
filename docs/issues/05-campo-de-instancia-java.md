**Title:** [Bug]: JVM: public instance field of an external class is unresolvable (`rect.height`) — `SEM025`

### Summary
JVM: public instance field of an external class is unresolvable (`rect.height`) — `SEM025`.

Found while writing KOFnes, a full SNES emulator in Kof (https://github.com/Marcelao98/KOFSnes). Repro folder: `docs/kof-repros/05-campo-de-instancia-java`.

### Target
JVM

### Kof version
0.6.4 (main `aaab7523`, built from source)

### Operating system
Ubuntu 24.04.5 LTS x86_64, OpenJDK 25

### Minimal reproduction
```kof
import java.awt.Rectangle;

main() {
    var r = new Rectangle(1, 2, 30, 40)
    println(r.height)
}
```

### Command used
`kof run main.kf`

### Expected behavior
Reading a public instance field of a JDK object works (static fields already do).

### Actual behavior
`main.kf:5:21: error: Cannot resolve field 'height' on type 'Rectangle' [SEM025]`

### Kof intent and existing idiom
Reading `java.awt.Rectangle.height`. Workaround: the getter `getHeight()`.

### Kof contract source
A comment in `ExternalClasspath.java` says external instance fields are supported — possible regression

### Classification (D-KOF-FIRST Gate 4)
Real gap — legitimate need with no adequate Kof solution
