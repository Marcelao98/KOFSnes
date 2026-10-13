# Kof 0.6.3 sob carga: o que um emulador de SNES encontrou

**Para:** Mel Santos e quem mantém o Kof4j\
**Versão testada:** Kof 0.6.3, commit `4db805c3` (main, 12/10/2026), alvos JVM e nativo x86-64, JDK 25\
**Projeto:** [KOFnes](../README.md), um emulador de Super Nintendo escrito do zero
em Kof (≈6.600 linhas), feito vibecodando com o Claude Code

---

## Primeiro, o que funcionou (e foi muito)

O KOFnes tem duas CPUs completas (65C816 e SPC700), chip de som, vídeo com
Mode 7, DMA e até o coprocessador Super FX. Tudo isso em Kof puro, validado
contra mais de 220 mil casos de teste públicos (SingleStepTests e ROMs de teste
de hardware). Os testes passaram, e **nenhum dos problemas abaixo apareceu no
código Kof puro**: classes, interfaces, arrays `Int[]`, operações de bit,
`switch` e herança se comportaram do jeito que a documentação descreve.

Também chamou atenção:

- **Desempenho de verdade.** O compilador gera bytecode JVM: o emulador roda a
  160–280 quadros por segundo sem janela, de 2,5 a 4,5× a velocidade de um SNES real.
- **Interop com Java usável no dia a dia.** Janela (AWT/Swing), som
  (`javax.sound`), imagens e implementar uma interface Java (`KeyListener`,
  `ActionListener`) funcionaram de primeira.
- **Mensagens de erro boas.** O `PARSE085` para `fn` diz exatamente o que fazer.

Os itens 1 a 11 estão na **fronteira com o Java**; os 12 a 15 são do alvo
nativo, e os 16 a 19, do alvo JavaScript. Cada um tem uma
reprodução de 5 a 20 linhas em [`kof-repros/`](kof-repros/), que roda com
`kof run main.kf`.

---

## Os cinco sérios: compilam sem erro e quebram ao rodar

### 1. Construtor do JDK com argumento de subtipo → `NoSuchMethodError`

```kof
var r = new BufferedReader(new FileReader("main.kf"))
```

O resultado é `NoSuchMethodError: BufferedReader.<init>(java.io.FileReader)`. O
bytecode chama um construtor com o tipo **exato** do argumento (`FileReader`) em
vez do tipo que o Java declara (`Reader`). Atinge os padrões mais comuns de
arquivos e streams do Java (`ZipInputStream(FileInputStream)`,
`BufferedReader(FileReader)`...). Passar um valor cujo tipo já é o declarado
(`new InputStreamReader(System.in)`) funciona.

- **Contorno:** um cast pro tipo declarado: `new FileReader(f) as Reader`.
- **Reproduções:** `02-construtor-jdk-com-subtipo`, `02b-bufferedreader-filereader`.

### 2. `Files.write(path, Byte[])` → `VerifyError` ao carregar

```kof
Files.write(new File("saida.bin").toPath(), bytes)   // bytes: Byte[]
```

A JVM recusa o programa inteiro antes de começar: o compilador escolheu o
overload `write(Path, Iterable, OpenOption...)` em vez de
`write(Path, byte[], OpenOption...)`. Pelo que li no código, a função que
traduz um tipo Kof pra classe Java (`toJavaClass`) não tem caso pra array.
Então os dois overloads empatam e ganha o que vier primeiro.

- **Contorno:** `FileOutputStream.write(bytes, 0, n)`.
- **Reprodução:** `01-files-write-byte-array`.

### 3. Método da própria classe como argumento de construtor do JDK

```kof
class Janela {
    abrir(String p) { println(new StringBuilder(nome(p)).toString()) }
    String nome(String s) { return s + ".srm" }
}
```

O resultado é `NoSuchMethodError: Default.Main.nome(String)`. A chamada sem
`this.` é resolvida como função de topo do `Main`, e ainda com retorno
`Object`. Com construtor de classe **Kof**, ou como argumento de método
estático Java, funciona.

- **Contorno:** `this.nome(p)`.
- **Reprodução:** `03-metodo-como-argumento-de-construtor-jdk`.
- **Nota:** no começo eu achei que o gatilho era estar dentro de um `try`.
  Não é: testei as variações e o que importa é ser argumento de construtor do
  JDK.

---

### 4. `e.printStackTrace()` sai com retorno `Object`

```kof
var e = new RuntimeException("x")
e.printStackTrace()
```

Dá `NoSuchMethodError: 'java.lang.Object java.lang.RuntimeException.printStackTrace()'`.
Se houver um `try` depois no mesmo método, é pior: a classe inteira não
carrega (`VerifyError: Inconsistent stackmap frames`), porque o "valor" que
sobra na pilha bagunça os frames. Achei isso no tratador de erro do próprio
emulador.

- **Contorno:** `System.err.println(e.toString())`.
- **Reprodução:** `10-printstacktrace`.

### 5. Array de objetos que vem do Java → `NoClassDefFoundError: ?`

```kof
var pilha = new RuntimeException("x").getStackTrace()
println(pilha.length)
```

O programa não carrega (`NoClassDefFoundError: ?`): o tipo do elemento
(`StackTraceElement`) fica sem nome no bytecode. Com `String[]`
(`new File(".").list()`) funciona.

- **Contorno:** não achei um bom. Evitei usar.
- **Reprodução:** `11-array-java-de-objetos`.

---

## Os médios: o compilador recusa, com mensagem clara

| # | Código | Mensagem | Contorno |
|---|---|---|---|
| 6 | `System.arraycopy(a, 0, b, 0, n)` com `Int[]` | `SEM014: expected 'Object' but got 'Int[]'` | laço manual |
| 7 | `retangulo.height` (campo público de classe Java) | `SEM025: Cannot resolve field 'height'` | getter (`getHeight()`) |
| 8 | `for (var s in Files.readAllLines(p))` | `SEM058: for-in only iterates over List<T>...` | laço com `size()`/`get(i)` |

São seguros (nada quebra escondido), mas cansam no dia a dia. Os detalhes:

- **No 7:** um comentário em `ExternalClasspath.java` diz que campo de
  instância externo "já é suportado", então pode ser regressão.
- **No 8:** `for-in` sobre `new ArrayList<String>()` **funciona**; só falha
  quando a lista vem do retorno de um método Java. A mensagem também fala de
  `String`, o que confunde nesse caso.

Reproduções: `04` a `06`.

---

## Os leves

9. **Stack trace com o arquivo errado.** Toda classe recebe o nome do arquivo
   de entrada no atributo `SourceFile`, porque é um nome só por módulo. Uma
   exceção em `app/Conta.kf:6` aparece como `main.kf:6` (reprodução `07`).
   Não quebra nada, mas manda a gente pro arquivo errado na hora de depurar.
10. **`val` como nome de parâmetro** gera 10 erros em cascata (`PARSE023`,
   `PARSE016`...) sem dizer que `val` é palavra reservada. O `fn` já tem a
   mensagem certinha (`PARSE085`); estender pra `val`/`var` resolveria
   (reprodução `08`).
11. **`case 1 -> { ... }` num switch statement** dá `expected ':' (switch
   statement) or '->' (switch expression)`, mesmo com o `->` ali. Uma dica
   tipo "o `->` com bloco só vale em switch expression; use `case 1:`"
   ajudaria (reprodução `09`).

---

## Uma sugestão de desempenho

O `switch` sobre `Int` vira uma **cadeia de comparações** no bytecode (cada
`case` faz `isub`, compara com 0 e salta). Não aparece nenhum
`tableswitch`/`lookupswitch` no programa inteiro. Pra `case` com constantes
inteiras densas (despacho de opcode, máquinas de estado, que é o caso típico
de emulador e interpretador), emitir `tableswitch` deve dar um ganho bom de
desempenho.

---

## O alvo nativo (achados da versão só-Kof)

Pra ter uma versão sem Java, compilei o mesmo núcleo com `--target native`
(janela e som pela SDL2, via `extern`). **Funciona**: a mesma ROM sai igual e
o `extern` com a SDL2 e a libc deu certo de primeira. No caminho:

12. **Desempenho: o nativo é ~16× mais lento que o JVM.** Um laço simples de
    array (`15-nativo-desempenho`) leva 2.214 ms no nativo e 142 ms no JVM. O
    emulador cai de 350–500 quadros por segundo (JVM) pra **~22**: o jogo roda
    a 1/3 da velocidade. O código gerado é de pilha (cada operação faz
    `push`/`pop`, toda variável mora na memória, todo acesso a array é uma
    chamada a `kof_array_get`), e o `--release` não muda nada. Um alocador de
    registradores simples e acesso a array em linha devem render muito.
13. **`main(String[] args)` recebe `args` vazio no nativo**, e
    `File("/proc/self/cmdline").readBytes()` também volta vazio (o arquivo diz
    ter tamanho 0). Contornei lendo o `/proc` com `fopen`/`fread` da libc via
    `extern` (reprodução `12`).
14. **`new File(p)` compila e o `ld` falha no nativo** (`undefined reference
    to File_init_1`); `File(p)` sem `new` funciona. Ou ele devia recusar com
    mensagem, ou aceitar os dois (reprodução `13`).
15. **`Buffer(U8)` não vale como tipo de campo de classe**: dá `PARSE023
    Expected parameter name` + `PARSE018` em cascata. Contornei com `malloc`
    da libc e o `buffer.peek/poke` na forma crua, com o endereço num `Long`
    (reprodução `14`).

---

## O alvo JavaScript (achados da versão sem Java)

Compilar o núcleo com `--target js` expôs 4 problemas. Corrigi os quatro no
compilador (`web/kof-js-correcoes.patch`, 222 linhas, todas em `js/`). Com
eles, a saída fica idêntica à do JVM e o jogo roda a 60 fps no navegador.

16. **`switch` que o compilador não consegue traduzir (`COMP002`).** Dois
    formatos travam o `JsSwitchParser`: o primeiro `case` com a comparação já
    fundida num salto (`case 0` vira `CJump(EQ)` direto), e `case` cujo corpo
    termina em `if (...) { return }` seguido de `return`, que não tem
    `Jump(end)`. Aí o corpo engolia os `case` seguintes.
17. **`switch` dentro de `if`, com todos os `case` terminando em `return`,
    compila ERRADO, em silêncio.** O fim do `switch` consumia o rótulo do
    `if` de fora, e o resto do método ia parar dentro do `if`. No emulador, o
    `read()` do chip de som devolvia `undefined` pra todo endereço fora de
    $F0–$FF, o chip de som executava 55 milhões de instruções por quadro e
    o jogo rodava a **0,3 fps**. É o mais grave dos quatro: não dá erro
    nenhum.
18. **Todo deslocamento de bits cria dois `BigInt`.** `x >> 4` vira
    `x >> Number(BigInt.asIntN(32, BigInt(4)))`, e num emulador são milhões
    por quadro. Agora o contador só passa por BigInt se for mesmo `Long`. Não
    medi o ganho isolado, porque o bug 17 escondia tudo.
19. **`Int[]` vira `Array` de JavaScript em vez de `Int32Array`.** Trocando,
    junto com o acesso sem conferir limites no modo rápido, foi de 60 pra 91
    fps no quadro mais pesado.

---

## Resumo

| # | Problema | Gravidade | Quando aparece |
|---|---|---|---|
| 1 | construtor JDK com subtipo | **alta** | rodando |
| 2 | `Files.write(path, Byte[])` | **alta** | ao carregar |
| 3 | método da classe como argumento de construtor JDK | **alta** | rodando |
| 4 | `printStackTrace()` com retorno `Object` | **alta** | rodando / ao carregar |
| 5 | array de objetos vindo do Java (`StackTraceElement[]`) | **alta** | ao carregar |
| 6 | `arraycopy` com `Int[]` | média | compilando |
| 7 | campo público de objeto Java | média | compilando |
| 8 | `for-in` em lista vinda do Java | média | compilando |
| 9 | `SourceFile` errado | baixa | depurando |
| 10 | diagnóstico de `val` | baixa | compilando |
| 11 | diagnóstico de `case ->` com bloco | baixa | compilando |
| 12 | nativo ~16× mais lento que o JVM | **alta** (desempenho) | rodando |
| 13 | `args` e `/proc` vazios no nativo | média | rodando |
| 14 | `new File` quebra o `ld` no nativo | média | ligando |
| 15 | `Buffer(U8)` como tipo de campo | média | compilando |
| 16 | JS: `switch` com arm fundido / `if`+`return` no corpo | média | compilando |
| 17 | JS: `switch` dentro de `if` compila errado | **alta** | rodando (silencioso) |
| 18 | JS: shift via `BigInt` | média (desempenho) | rodando |
| 19 | JS: `Int[]` como `Array` em vez de `Int32Array` | média (desempenho) | rodando |

Os sérios parecem vir de **poucos pontos pequenos** do compilador: tipos
de array na escolha de overload, construtores do JDK escolhidos só pela
quantidade de argumentos, e a resolução de chamada sem `this` dentro de
argumento de construtor. A [versão técnica deste relatório](relatorio-kof-ia.md)
traz os arquivos e linhas suspeitos, a saída exata de cada caso e sugestões de
teste de regressão.

Procurei esses casos no `known-bugs.md` (até o §681) e não encontrei nenhum
já registrado.

Obrigado pela linguagem. Foi divertido demais ver um Super Nintendo nascer em
Kof. ☕
