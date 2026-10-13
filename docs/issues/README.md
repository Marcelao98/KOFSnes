# Issues para o Kof4j (prontas pra colar)

Reproduzidas na **Kof 0.6.4** (`aaab7523`). Cada arquivo segue o formulário `bug_report.yml` do Kof4j: título, e cada seção na ordem dos campos. Abrir em https://github.com/KofLang/Kof4j/issues/new?template=bug_report.yml

> Antes de enviar: o modelo pede pra marcar "procurei issues existentes". Eu só consegui procurar no `docs/bugs-and-gaps/known-bugs.md` (nenhuma duplicata); as issues do GitHub não. Vale uma busca rápida pelo título.

| # | Título | Alvo |
|---|---|---|
| 1 | [JVM: `Files.write(Path, Byte[])` picks the `Iterable` overload → `VerifyError` at load](01-files-write-byte-array.md) | JVM |
| 2 | [JVM: JDK constructor called with a subtype argument → `NoSuchMethodError` (`BufferedReader(FileReader)`, `ZipInputStream(FileInputStream)`)](02-construtor-jdk-com-subtipo.md) | JVM |
| 3 | [JVM: unqualified self-method call inside a JDK constructor argument binds to `Default.Main` → `NoSuchMethodError`](03-metodo-como-argumento-de-construtor-jdk.md) | JVM |
| 4 | [JVM: `Int[]` not accepted for an `Object` parameter of an external method (`System.arraycopy`) — `SEM014`](04-arraycopy-int-array.md) | JVM |
| 5 | [JVM: public instance field of an external class is unresolvable (`rect.height`) — `SEM025`](05-campo-de-instancia-java.md) | JVM |
| 6 | [JVM: `for-in` rejects a `java.util.List` returned by a JDK method — `SEM058` with a String-oriented message](06-for-in-lista-vinda-do-java.md) | JVM |
| 7 | [JVM: every class gets the entry file as `SourceFile` → stack traces point to the wrong file](07-sourcefile-errado.md) | JVM |
| 8 | [Diagnostics: `val` as a parameter name gives a 10-error cascade, no reserved-word hint](08-val-como-nome-de-parametro.md) | Unknown / all |
| 9 | [Diagnostics: `case 1 -> { … }` in a switch statement gives a self-contradictory message](09-switch-statement-com-seta.md) | Unknown / all |
| 10 | [JVM: `Throwable.printStackTrace()` emitted with an `Object` return → `NoSuchMethodError` / `VerifyError`](10-printstacktrace.md) | JVM |
| 11 | [JVM: Java method returning a non-String object array (`StackTraceElement[]`) → `NoClassDefFoundError: ?`](11-array-java-de-objetos.md) | JVM |
| 12 | [Native: `main(String[] args)` receives an empty array; `File(<procfs file>).readBytes()` returns empty](12-nativo-argv-e-proc.md) | Native |
| 13 | [Native: `new File(p)` type-checks, then the link fails (`undefined reference to File_init_1`)](13-nativo-new-file.md) | Native |
| 14 | [`Buffer(U8)` is rejected as a class field type (`PARSE023` + `PARSE018`)](14-buffer-como-campo.md) | Unknown / all |
| 15 | [Native x86-64: stack-machine codegen ~13× slower than JVM; `--release` does not change it](15-nativo-desempenho.md) | Native |
| 16 | [JS: `switch` whose first arm is `case 0` (fused compare) and whose arms end in `if (…) { return }` + `return` → `COMP002`](16-js-switch-case-zero.md) | JS |
| 17 | [JS (silent miscompile): `switch` inside `if`, all arms `return` → code after the `if` lands inside it](17-js-switch-dentro-de-if.md) | JS |
| 18 | [JS (perf): every Int shift count goes through `Number(BigInt.asIntN(32, BigInt(n)))`](18-js-shift-bigint.md) | JS |
| 19 | [JS (perf): `new Int[n]` emits `new Array(n).fill(0)` instead of `Int32Array`](19-js-int-array.md) | JS |
