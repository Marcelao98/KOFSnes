# Kof 0.6.3 sob carga: o que um emulador de SNES encontrou

**Para:** Mel Santos e quem mantém o Kof4j
**Versão testada:** Kof 0.6.3, commit `4db805c3` (main, 12/10/2026), alvo JVM, JDK 25
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

Todos os bugs abaixo estão na **fronteira com o Java**. Cada um tem uma
reprodução de 5 a 20 linhas em [`kof-repros/`](kof-repros/), que roda com
`kof run main.kf`.

---

## Os três sérios: compilam sem erro e quebram ao rodar

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

## Os médios: o compilador recusa, com mensagem clara

| # | Código | Mensagem | Contorno |
|---|---|---|---|
| 4 | `System.arraycopy(a, 0, b, 0, n)` com `Int[]` | `SEM014: expected 'Object' but got 'Int[]'` | laço manual |
| 5 | `retangulo.height` (campo público de classe Java) | `SEM025: Cannot resolve field 'height'` | getter (`getHeight()`) |
| 6 | `for (var s in Files.readAllLines(p))` | `SEM058: for-in only iterates over List<T>...` | laço com `size()`/`get(i)` |

São seguros (nada quebra escondido), mas cansam no dia a dia. Os detalhes:

- **No 5:** um comentário em `ExternalClasspath.java` diz que campo de
  instância externo "já é suportado", então pode ser regressão.
- **No 6:** `for-in` sobre `new ArrayList<String>()` **funciona**; só falha
  quando a lista vem do retorno de um método Java. A mensagem também fala de
  `String`, o que confunde nesse caso.

Reproduções: `04` a `06`.

---

## Os leves

7. **Stack trace com o arquivo errado.** Toda classe recebe o nome do arquivo
   de entrada no atributo `SourceFile`, porque é um nome só por módulo. Uma
   exceção em `app/Conta.kf:6` aparece como `main.kf:6` (reprodução `07`).
   Não quebra nada, mas manda a gente pro arquivo errado na hora de depurar.
8. **`val` como nome de parâmetro** gera 10 erros em cascata (`PARSE023`,
   `PARSE016`...) sem dizer que `val` é palavra reservada. O `fn` já tem a
   mensagem certinha (`PARSE085`); estender pra `val`/`var` resolveria
   (reprodução `08`).
9. **`case 1 -> { ... }` num switch statement** dá `expected ':' (switch
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

## Resumo

| # | Problema | Gravidade | Quando aparece |
|---|---|---|---|
| 1 | construtor JDK com subtipo | **alta** | rodando |
| 2 | `Files.write(path, Byte[])` | **alta** | ao carregar |
| 3 | método da classe como argumento de construtor JDK | **alta** | rodando |
| 4 | `arraycopy` com `Int[]` | média | compilando |
| 5 | campo público de objeto Java | média | compilando |
| 6 | `for-in` em lista vinda do Java | média | compilando |
| 7 | `SourceFile` errado | baixa | depurando |
| 8 | diagnóstico de `val` | baixa | compilando |
| 9 | diagnóstico de `case ->` com bloco | baixa | compilando |

Os três sérios parecem vir de **poucos pontos pequenos** do compilador: tipos
de array na escolha de overload, construtores do JDK escolhidos só pela
quantidade de argumentos, e a resolução de chamada sem `this` dentro de
argumento de construtor. A [versão técnica deste relatório](relatorio-kof-ia.md)
traz os arquivos e linhas suspeitos, a saída exata de cada caso e sugestões de
teste de regressão.

Procurei esses casos no `known-bugs.md` (até o §681) e não encontrei nenhum
já registrado.

Obrigado pela linguagem. Foi divertido demais ver um Super Nintendo nascer em
Kof. ☕
