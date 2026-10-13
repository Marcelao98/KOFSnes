# Kof 0.6.3 — compiler defect report (machine-oriented)

> AI/agent-oriented version. The human version is [`relatorio-kof.md`](relatorio-kof.md)
> (Portuguese). This one is in English to match the canonical
> `docs/bugs-and-gaps/known-bugs.md` of Kof4j. Every item was reproduced, and
> every repro is runnable.

## 0. Context and environment

| Key | Value |
|---|---|
| Compiler | Kof4j `0.6.3`, commit `4db805c3` (branch `main`, 2026-10-12) |
| Build | `mvn -pl kof-cli -am package -DskipTests` with JDK 25 (`maven.compiler.release=25`) |
| Runtime | OpenJDK 25 (Ubuntu `openjdk-25-jdk-headless`), Linux x86-64 |
| Target | JVM only (`kof run main.kf`, `kof build ... --output`). No other target was exercised. |
| Emitted class version | 65 (Java 21); `cw.visit(V21, ...)` in `jvm/JvmBackend.java` |
| Workload | KOFnes, a SNES emulator in Kof: ~6,600 lines, 16 classes, 2 interfaces, heavy `Int[]`/bitwise/`switch`, JDK interop for AWT/Swing/`javax.sound`/`java.nio`/`java.util.zip` |
| Repros | `docs/kof-repros/<NN-name>/main.kf` (one dir per item; `07` also has `app/Conta.kf`) |

Run every repro:

```bash
for d in docs/kof-repros/*/; do echo "== $d"; (cd "$d" && kof run main.kf 2>&1 | head -6); done
```

Scope note: no defect was observed in pure-Kof code. All of these sit at the
JVM interop boundary (items 1–6), in debug metadata (7), or in diagnostics (8–9).
Item 10 is a performance observation, not a defect.

Duplicate check: `docs/bugs-and-gaps/known-bugs.md` (through §681) was searched
for `Files.write`, `ZipInputStream`, `BufferedReader`, `arraycopy`, `SourceFile`,
`readAllLines`, external instance fields and constructor descriptors. No
matching entry was found.

## 1. Summary table

| ID | Title | Severity | Failure stage | Root cause status |
|---|---|---|---|---|
| K1 | JDK constructor call uses argument static types as the descriptor | **High** | runtime `NoSuchMethodError` | **Confirmed by code reading** |
| K2 | JDK overload resolution ignores Kof array argument types | **High** | class load `VerifyError` | **Confirmed by code reading** |
| K3 | Unqualified self-method call inside a JDK-constructor argument binds to `Default.Main` | **High** | runtime `NoSuchMethodError` | **Strong hypothesis** (code reading) |
| K4 | `Int[]` not assignable to `Object` parameter of an external method | Medium | compile `SEM014` | Not located |
| K5 | Public instance field of an external (JDK) class is unresolvable | Medium | compile `SEM025` | Not located |
| K6 | `for-in` rejects a `java.util.List` returned by a JDK method | Medium | compile `SEM058` | Not located |
| K7 | Every class gets the entry file as `SourceFile` | Low | wrong stack traces | **Confirmed by code reading** |
| K8 | `val` as an identifier yields a 10-error cascade, no reserved-word hint | Low | diagnostics | Located (`ParseContext.expectId`) |
| K9 | `case X -> { … }` in a switch statement: misleading message | Low | diagnostics | Not located |
| K10 | Dense `Int` `switch` lowered to a compare chain, never `tableswitch` | Perf | — | Observed in bytecode |

---

## K1 — JDK constructor descriptor = argument static types

**Repros:** `02-construtor-jdk-com-subtipo`, `02b-bufferedreader-filereader`

```kof
import java.io.BufferedReader;
import java.io.FileReader;

main() {
    var r = new BufferedReader(new FileReader("main.kf"))
    println(r.readLine())
}
```

- **Expected:** prints the first line of `main.kf` (`javac` binds `BufferedReader(Reader)`).
- **Actual (verbatim):**
  ```
  java.lang.NoSuchMethodError: 'void java.io.BufferedReader.<init>(java.io.FileReader)'
  	at Default.Main.main(main.kf:5)
  ```
  `02`: `NoSuchMethodError: 'void java.util.zip.ZipInputStream.<init>(java.io.FileInputStream)'`.

**Trigger matrix (measured):**

| Call | Result |
|---|---|
| `new BufferedReader(new FileReader(p))` | ❌ NoSuchMethodError |
| `new ZipInputStream(new FileInputStream(p))` | ❌ NoSuchMethodError |
| `new ZipInputStream(new FileInputStream(p) as InputStream)` | ✅ |
| `new BufferedReader(new FileReader(p) as Reader)` | ✅ |
| `new InputStreamReader(System.in)` (static type already the formal) | ✅ |
| `new BufferedImage(256, 224, BufferedImage.TYPE_INT_RGB)` (primitives) | ✅ |

**Root cause (by code reading):**

1. `SemNewExprTyper.infer` (external branch, around lines 106–118) and
   `ExpressionLowerer` (`NewExpr` case, around lines 233–245) call
   `ExternalClasspath.resolveConstructor(internal, argc)`.
2. `resolveConstructor` (`ExternalClasspath.java:337`) delegates to
   `resolveMethod(owner, "<init>", argc)` → `resolveMethodWithArgs` → for JDK
   owners `JdkReflectionResolver.resolveJdkMethodWithArgs`.
3. `resolveJdkMethodWithArgs` (`JdkReflectionResolver.java:55`) iterates
   `cls.getMethods()`. `Class.getMethods()` never returns constructors, so
   `"<init>"` never matches and the result is `null` for every JDK class.
4. Back in `ExpressionLowerer`, `extCtor == null` → `ctorParamTypes = argTypes`
   → `INVOKESPECIAL <init>` with the argument static types. This is correct
   only by coincidence, when every static type equals the declared formal.

`JdkReflectionResolver.resolvePublicJdkConstructor` (line ~182) does iterate
`getConstructors()`, but by arity only (first match wins), so switching to it
alone would trade this bug for wrong-overload picks (`StringBuilder(int)` vs
`StringBuilder(String)` vs `StringBuilder(CharSequence)`).

**Suggested fix:** a constructor resolver with the same scoring as
`resolveJdkMethodWithArgs` (exact > assignable > box-compatible; varargs
penalty) over `cls.getConstructors()`, fed the argument types, and called from
both `SemNewExprTyper` and `ExpressionLowerer`. The bare-call ctor path
(`ExpressionBareCallLowerer.tryLowerExternalCtor`, `Classe(args)` without
`new`) should use it too.

**Regression test idea:** a JVM E2E golden over the matrix above plus
`new StringBuilder("x")`, `new StringBuilder(16)` and
`new StringBuilder(someCharSequence)`. Each must bind the overload `javac`
picks.

**Workaround used in KOFnes:** `as <DeclaredFormalType>` on the argument.

---

## K2 — JDK overload resolution ignores Kof array argument types

**Repro:** `01-files-write-byte-array`

```kof
import java.io.File;
import java.nio.file.Files;

main() {
    var b = new Byte[3]
    b[0] = 75 as Byte
    b[1] = 79 as Byte
    b[2] = 70 as Byte
    Files.write(new File("saida.bin").toPath(), b)
    println("ok")
}
```

- **Expected:** writes 3 bytes and prints `ok` (`Files.write(Path, byte[], OpenOption...)`).
- **Actual (verbatim):**
  ```
  kof run: could not load main class Default.Main
  java.lang.VerifyError: Bad type on operand stack
    Location: Default/Main.main([Ljava/lang/String;)V @36: invokestatic
    Reason: Type '[B' (current frame, stack[1]) is not assignable to 'java/lang/Iterable'
    stack: { 'java/nio/file/Path', '[B', '[Ljava/nio/file/OpenOption;' }
  ```
  The program is rejected at class load, before any statement runs.

**Root cause (by code reading):** `JdkReflectionResolver.toJavaClass(Type)`
(`JdkReflectionResolver.java:202`) handles `PrimitiveType` and `ClassType` but
has no branch for `Type.ArrayType` and returns `null`. In
`resolveJdkMethodWithArgs` a `null` argument class adds `score += 1` to every
candidate, so `write(Path, byte[], OpenOption...)` and
`write(Path, Iterable, OpenOption...)` tie. The `score > bestScore` comparison
keeps the first candidate in `getMethods()` order, and the JDK leaves that order
unspecified. Here it was the `Iterable` overload.

**Suggested fix:** map `ArrayType(elem)` → `toJavaClass(elem).arrayType()`
(with `Int[]`→`int[]`, `Byte[]`→`byte[]`, etc., same as the emitted
descriptors). Also consider failing loudly (`SEM057`-style ambiguity) when the
top score is tied and the tied candidates have different descriptors, instead
of keeping the first one. That would have produced a compile error here rather
than a `VerifyError`.

**Regression test idea:** `Files.write(path, Byte[])`,
`Arrays.fill(Int[], Int)`, `Arrays.sort(Int[])`, `String(Byte[], …)` (also K1),
and `InputStream.read(Byte[], Int, Int)`.

**Workaround used in KOFnes:** `FileOutputStream(path).write(b, 0, n)`, which
has no competing same-arity overload.

---

## K3 — Unqualified self-method call inside a JDK constructor argument binds to `Default.Main`

**Repro:** `03-metodo-como-argumento-de-construtor-jdk`

```kof
class Caixa {
    String s
    public constructor(String s) { this.s = s }
}

class Janela {
    public constructor() { }
    abrir(String path) {
        println(Caixa(nome(path)).s)
        println(new StringBuilder(nome(path)).toString())
    }
    String nome(String s) {
        return s + ".srm"
    }
}

main() {
    Janela().abrir("jogo")
}
```

- **Expected:** `jogo.srm` twice.
- **Actual (verbatim):**
  ```
  jogo.srm
  java.lang.NoSuchMethodError: 'java.lang.Object Default.Main.nome(java.lang.String)'
  	at Janela.abrir(main.kf:10)
  	at Default.Main.main(main.kf:18)
  ```
  The call is emitted as `INVOKESTATIC Default/Main.nome(Ljava/lang/String;)Ljava/lang/Object;`:
  the wrong owner, static instead of virtual, and an `Object` return.

**Trigger matrix (measured):**

| Expression inside an instance method | Result |
|---|---|
| `println(nome(p))` | ✅ |
| `var s = nome(p)` | ✅ |
| `Caixa(nome(p))` (Kof class ctor) | ✅ |
| `Integer.parseInt(nome(p))` (JDK static method arg) | ✅ |
| `new File(nome(p))` / `new StringBuilder(nome(p))` (JDK ctor arg) | ❌ |
| `new File(nome(p), "x")` (JDK 2-arg ctor) | ❌ |
| `new File(this.nome(p))` | ✅ |
| inside or outside `try`; class in a package or in the entry file | ❌ either way (not a factor) |

**Root cause (strong hypothesis, by code reading):**
`SemNewExprTyper.infer` types the constructor arguments
(`SemExpressionTyper.inferType(sa, arg, scope)`, lines 52–53) **only in the
Kof-class branch**. The external-class branch (lines ~98–121) qualifies the
type, tries `resolveConstructor` (always `null` for JDK owners, see K1) and
returns the `ClassType` **without ever visiting `ne.arguments()`**. The nested
`MethodCallExpr nome(p)` therefore never gets a `getResolvedMethod(mc)` entry
from the semantic pass. The lowerer then takes its unresolved bare-call
fallback, which emits a top-level function call on the module class with an
`Object` return.

**Suggested fix:** visit/type every `ne.arguments()` element in the external
branch too, before returning, and use those types for the K1 constructor
scoring. Any other early-returning branch of `SemNewExprTyper.infer` (and of
the bare `Classe(args)` path) probably needs the same audit.

A cheap defensive check: when the lowerer is about to emit a bare call against
`Default/Main` for a name that is not a declared top-level function, fail with
an internal-compiler-error diagnostic. Today it emits invalid code silently.

**Regression test idea:** the matrix above as a golden.

**Workaround used in KOFnes:** `this.nome(p)`.

> History: this was first misattributed to `try` blocks in the KOFnes
> README. Variant testing ruled that out.

---

## K4 — `Int[]` is not assignable to an `Object` parameter of an external method

**Repro:** `04-arraycopy-int-array`

```kof
import java.lang.System;

main() {
    var a = new Int[4]
    var b = new Int[4]
    a[0] = 7
    System.arraycopy(a, 0, b, 0, 4)
    println(b[0])
}
```

- **Expected:** `7`. `int[]` is an `Object` in the JVM type system (JVMS §4.10.1.2).
- **Actual:** `main.kf:7:22: error: Argument 1 of 'arraycopy': expected 'Object' but got 'Int[]' [SEM014]`
- **Notes:** §355/`SEM098` correctly forbids `Int[]` → `T[]`; this is the
  different, legal `Int[]` → `Object` widening. Every primitive and reference
  array should be assignable to `java.lang.Object`, `Cloneable` and
  `java.io.Serializable` formals.
- **Location:** not pinned. Start at the argument-compatibility check that
  emits `SEM014` for external static calls.
- **Workaround:** manual copy loop.

---

## K5 — public instance field of an external class is unresolvable

**Repro:** `05-campo-de-instancia-java`

```kof
import java.awt.Rectangle;

main() {
    var r = new Rectangle(1, 2, 30, 40)
    println(r.height)
}
```

- **Expected:** `40` (`public int height`).
- **Actual:** `main.kf:5:21: error: Cannot resolve field 'height' on type 'Rectangle' [SEM025]`
- **Notes:** public **static** fields work (`BufferedImage.TYPE_INT_RGB`,
  §500 slice B). The Javadoc of `ExternalClasspath.resolveStaticFieldType`
  says instance fields are "already supported by the receiver-value external
  block", so this may be a regression or a JDK-vs-`--deps` gap: the JDK path
  goes through reflection, `--deps` through class bytes. The diagnostic is
  emitted at `SemFieldAccessTyper.java:208`.
- **Workaround:** getter (`getHeight()`; note it returns `double`, hence `as Int`).

---

## K6 — `for-in` rejects a `java.util.List` returned by a JDK method

**Repro:** `06-for-in-lista-vinda-do-java`

```kof
import java.io.File;
import java.nio.file.Files;

main() {
    var lines = Files.readAllLines(new File("main.kf").toPath())
    for (var s in lines) {
        println(s)
    }
}
```

- **Expected:** prints the file.
- **Actual:** `main.kf:6:5: error: `for-in` only iterates over `List<T>` or arrays in Kof; for String use `s.charAt(i)` in a numeric loop [SEM058]`
- **Contrast (measured):** `var l = new ArrayList<String>(); for (var s in l)`
  works, because `new ArrayList<T>()` is typed as Kof `List`. The return type
  of `Files.readAllLines` (`java/util/List`) is not mapped to Kof `List`, so
  `StatementAnalyzer` (`SEM058`, line ~300) rejects it.
- **Two asks:**
  1. Treat any external type assignable to `java.lang.Iterable` as iterable,
     or map `java/util/List` returns to Kof `List`.
  2. The message mentions `String` even when the subject is a list; make it
     say the actual subject type.
- **Workaround:** `var i = 0; while (i < lines.size()) { var s = lines.get(i) as String; ... }`.

---

## K7 — every class gets the entry file as `SourceFile`

**Repro:** `07-sourcefile-errado` (`main.kf` + `app/Conta.kf`)

```kof
// app/Conta.kf
package app

class Conta {
    public constructor() { }
    Int dividir(Int a, Int b) {
        return a / b
    }
}
```

- **Expected:** `at app.Conta.dividir(Conta.kf:6)`.
- **Actual (verbatim):**
  ```
  java.lang.ArithmeticException: / by zero
  	at app.Conta.dividir(main.kf:6)
  	at Default.Main.main(main.kf:4)
  ```
  `javap -v app/Conta.class` → `SourceFile: "main.kf"`.
- **Root cause (by code reading):** `JvmBackend` stores one
  `this.sourceName = module.sourceName()` (`jvm/JvmBackend.java:116`) and emits
  it for every class (`cw.visitSource(sourceName, null)`, line ~202).
  `IRModule` carries a single `sourceName`. The line numbers are right; only
  the file name is wrong.
- **Suggested fix:** carry the originating compilation-unit file per `IRClass`
  (the directory-import expansion in `CompilerImports.expandKofImports` knows
  it) and emit that. `NativeBackend` has the same single-name pattern
  (`nat/NativeBackend.java:245`), so native debug info probably shares the
  issue (not tested).

---

## K8 — `val` as an identifier: 10-error cascade, no reserved-word hint

**Repro:** `08-val-como-nome-de-parametro`

```kof
class A {
    write(Int addr, Int val) {
        println(val)
    }
}
```

- **Actual:** 10 errors (`PARSE023`, `PARSE012`, `PARSE016` ×2, `PARSE020`,
  `PARSE021`, `PARSE044`, `PARSE023`, `PARSE022`, `PARSE041`), none of which
  says that `val` is reserved.
- **Good precedent:** `ParseContext.expectId` (`parser/ParseContext.java:~152`)
  already special-cases `FUN`/`FN`/`FUNC` with `PARSE085` and recovers. The same
  treatment for `VAL`/`VAR` (and the other keywords that look like
  identifiers) with recovery would collapse the cascade into one actionable
  line. A natural name to hit this with: emulator and driver code uses
  `write(addr, val)` everywhere.

---

## K9 — `case X -> { … }` in a switch statement: misleading message

**Repro:** `09-switch-statement-com-seta`

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

- **Actual:** `main.kf:4:16: error: expected ':' (switch statement) or '->' (switch expression) [PARSE073]`,
  plus `PARSE041` per case. The token **is** `->`, so the message reads as
  self-contradictory.
- **Ask:** either accept arrow-with-block as statement form (Java 14+ users
  write it by reflex), or emit one targeted message: "`->` cases are switch
  expressions; in a switch statement use `case 0:`".

---

## K10 — dense `Int` `switch` is lowered to a compare chain (performance)

Observed in `snes/Cpu.kf` (16-way `switch (op >> 4)` dispatching to 16 more
16-way switches) with `javap -c`:

```
 4: iload_2
 5: iconst_0
 6: if_icmpeq 161
 9: goto 12
12: iload_2
13: iconst_1
14: isub
15: iconst_0
16: if_icmpeq 169
19: goto 22
...
```

All 22 emitted classes contain **0** `tableswitch`/`lookupswitch` instructions. Each
`case` costs `iload, iconst, isub, iconst_0, if_icmpeq, goto`, so dispatch is
O(n) per switch. For constant, dense `Int` (and `Char`/`Byte`) cases, emitting
`tableswitch` (`lookupswitch` when sparse) would make opcode-dispatch code, the
typical interpreter/emulator/state-machine hot path, O(1). The lowering lives
in `SwitchStmtLowerer` (and the expression-switch counterpart). This is a
suggestion only, not a correctness issue.

---

## 11. Checked and discarded (to save triage time)

| Suspicion | Verdict |
|---|---|
| `try { … } catch (Exception e)` not catching `NoSuchMethodError` | Correct JVM semantics (`Error` ≠ `Exception`). |
| `for-in` over `new ArrayList<T>()` | Works; see K6 for the actual failing case. |
| `fn` as a field name | Correctly diagnosed (`PARSE085`). |
| Build fails on JDK 21 (`release version 25 not supported`) | Documented: README and `learn/01-installation` require JDK 25. Only nit: the comment in `bin/kof` (line ~49) still says the embedded JDK is Temurin 21. |
| Module root = directory of the entry file; one `main()` per module (`PKG002`) | By design (`docs/language-reference/modules.md`). It shaped KOFnes into one entry point with sub-commands. |
| `println` of non-ASCII printing `?` under a POSIX locale | JVM default charset behavior, not Kof. |

## 12. Paste-ready one-liners (known-bugs style)

- **K1** — `new <JdkClass>(<subtype-arg>)` → `NoSuchMethodError`: `resolveConstructor` → `resolveJdkMethodWithArgs` scans `getMethods()` (no ctors), the lowerer falls back to the arg static types as the `<init>` descriptor.
- **K2** — JDK overload pick ignores Kof arrays: `toJavaClass` lacks `ArrayType`, candidates tie at +1, first-in-`getMethods()` wins → `Files.write(Path, Byte[])` binds `Iterable` → `VerifyError`.
- **K3** — `new <JdkClass>(selfMethod(x))` inside an instance method emits `INVOKESTATIC Default/Main.selfMethod(...)Object` → `NoSuchMethodError`; `SemNewExprTyper` external branch never types `ne.arguments()`.
- **K4** — `Int[]` → `Object` external formal rejected (`SEM014`), e.g. `System.arraycopy`.
- **K5** — external public instance field unresolvable (`SEM025`), e.g. `Rectangle.height`; static fields work.
- **K6** — `for-in` over a `java.util.List` returned by a JDK method → `SEM058`; the message mentions `String`.
- **K7** — `SourceFile` = entry file for every class (`JvmBackend.sourceName` per module).
- **K8** — `val` identifier → 10-error cascade; extend the `PARSE085` treatment.
- **K9** — `case X -> { }` in a statement switch → self-contradictory `PARSE073`.
- **K10** — no `tableswitch`/`lookupswitch` emitted for dense `Int` switches.
