# Como o Super Nintendo funciona

*Um passeio por dentro do console, antes de falar do emulador.*

> Este texto explica o **hardware** do Super Nintendo: o que tem dentro da
> caixa, o que cada chip faz e como eles conversam para que um quadro de
> Super Mario World apareça na TV 60 vezes por segundo. Não precisa saber
> eletrônica nem programação, só curiosidade. No fim tem um mapa de onde cada
> peça mora no código do KOFnes.

---

## Sumário

1. [A visão de cima](#1-a-visão-de-cima)
2. [O relógio: tudo anda no mesmo compasso](#2-o-relógio-tudo-anda-no-mesmo-compasso)
3. [O cérebro: a CPU 65816](#3-o-cérebro-a-cpu-65816)
4. [A memória e o mapa de endereços](#4-a-memória-e-o-mapa-de-endereços)
5. [O cartucho](#5-o-cartucho)
6. [A imagem: a PPU](#6-a-imagem-a-ppu)
7. [Os truques visuais: Mode 7, HDMA, transparência](#7-os-truques-visuais-mode-7-hdma-transparência)
8. [O som: um computador inteiro só pra música](#8-o-som-um-computador-inteiro-só-pra-música)
9. [O controle](#9-o-controle)
10. [DMA: o caminhão de mudança](#10-dma-o-caminhão-de-mudança)
11. [Um quadro na vida do SNES](#11-um-quadro-na-vida-do-snes)
12. [Os chips extras dos cartuchos](#12-os-chips-extras-dos-cartuchos)
13. [Por que emular é difícil](#13-por-que-emular-é-difícil)
14. [Do console ao KOFnes](#14-do-console-ao-kofnes)
15. [Glossário rápido](#15-glossário-rápido)

---

## 1. A visão de cima

O Super Nintendo (no Japão, **Super Famicom**) saiu em novembro de 1990 no
Japão e em 1991 nos Estados Unidos. Por dentro, ele não é "um chip que roda o
jogo". É uma pequena equipe de chips especializados, cada um com o seu
trabalho:

```
                ┌──────────────────────────────────────────────┐
                │                CARTUCHO                       │
                │  ROM (o jogo) · SRAM + bateria (o save)       │
                │  às vezes um chip extra (Super FX, SA-1...)   │
                └───────────────────────┬──────────────────────┘
                                        │ barramento
   ┌──────────┐     ┌───────────────────┴───────────────────┐
   │ CONTROLE │────▶│  CPU  (Ricoh 5A22, núcleo 65816)       │
   └──────────┘     │  + DMA + multiplicação/divisão         │
                    │  + WRAM (128 KB de memória de trabalho)│
                    └──────┬──────────────────────┬──────────┘
                           │                      │ 4 "caixas de correio"
                ┌──────────┴─────────┐   ┌────────┴──────────────────┐
                │ PPU (2 chips)      │   │ APU = SPC700 + DSP        │
                │ VRAM 64 KB         │   │ ARAM 64 KB                │
                │ paleta 256 cores   │   │ 8 vozes, 32 kHz, estéreo  │
                │ sprites (OAM)      │   │                           │
                └──────────┬─────────┘   └────────┬──────────────────┘
                           │ vídeo                 │ áudio
                           └──────────▶ TV ◀──────┘
```

Os papéis, em uma frase cada:

| Peça | O que faz | Analogia |
|---|---|---|
| **CPU** | roda o código do jogo: física, inimigos, pontuação, menus | o diretor do filme |
| **WRAM** | memória onde o jogo guarda o que está acontecendo agora | o caderno de anotações do diretor |
| **PPU** | desenha a imagem, linha por linha, a partir de peças prontas | a equipe de cenografia |
| **VRAM** | guarda as peças de desenho (tiles) e os mapas de cenário | o depósito de cenários |
| **APU** | um segundo computador, separado, que só faz som | a orquestra, com regente próprio |
| **Cartucho** | o jogo em si (ROM) e o save (SRAM com bateria) | o roteiro e o diário |
| **DMA** | copia grandes blocos de dados sem ocupar a CPU | o caminhão de mudança |

A ideia mais importante do console é esta: **a CPU não desenha a imagem nem
toca o som**. Ela só *prepara* as coisas (diz "o Mario está aqui", "toque
essa nota") e os chips especialistas fazem o trabalho pesado, ao mesmo tempo.

---

## 2. O relógio: tudo anda no mesmo compasso

Todo computador tem um relógio, um cristal que vibra num ritmo fixo e dá o
"tique" que faz cada chip avançar um passo. No SNES americano/japonês (NTSC),
o **relógio mestre** bate **21.477.272 vezes por segundo** (≈ 21,48 MHz).

Cada chip anda numa fração desse ritmo:

- a **CPU** gasta 6, 8 ou 12 tiques mestres por acesso à memória, dependendo
  de *onde* está lendo. Isso dá entre **1,79 e 3,58 MHz** de velocidade
  efetiva;
- a **PPU** desenha **1 pixel a cada 4 tiques** mestres;
- a **APU** tem o seu próprio cristal (≈ 24,576 MHz) e não depende do relógio
  da CPU. É por isso que o som do SNES continua tocando direitinho mesmo quando
  o jogo dá uma engasgada.

Na TV, a imagem é desenhada como num tear: uma **linha** de cada vez, de cima
para baixo. No NTSC são **262 linhas por quadro** e **60 quadros por segundo**
(na verdade 60,09). Cada linha tem 340 "pontos" de tempo; desses, só 256 viram
pixels visíveis. O resto é a margem que a TV de tubo precisava para o feixe
de elétrons voltar para a esquerda.

```
  linha 0 ─────────────────────────────── (escondida)
  linha 1   ████████████████████████  ┐
   ...      ████  área visível  ████  │ 224 linhas visíveis
  linha 224 ████████████████████████  ┘
  linha 225 ─ VBLANK: o feixe volta pro topo ─┐
   ...                                        │ ~37 linhas de "folga"
  linha 261 ──────────────────────────────────┘
```

Esses dois intervalos de folga têm nome e são **sagrados** para o programador:

- **HBlank**: o fim de cada linha, quando o feixe volta para a esquerda.
- **VBlank**: o fim do quadro, quando o feixe volta para o topo. É a única
  hora em que é seguro mexer à vontade na memória de vídeo, porque a PPU não
  está desenhando nada.

Quase todo jogo de SNES é organizado em volta do VBlank, como vamos ver na
seção 11.

---

## 3. O cérebro: a CPU 65816

A CPU do SNES é um chip da Ricoh chamado **5A22**. Dentro dele mora um
processador **65C816** (ou só 65816), o "irmão mais velho" do 6502, o famoso
processador do NES, do Apple II e do Commodore 64.

### 3.1 Registradores: as mãos da CPU

A CPU não faz conta direto na memória. Ela traz os números para dentro de
pequenas gavetas internas, os **registradores**, mexe neles e devolve.

| Registrador | Para que serve |
|---|---|
| **A** (acumulador) | onde as contas acontecem: somar, subtrair, comparar |
| **X** e **Y** | contadores e índices ("o 5º inimigo da lista") |
| **S** (pilha) | aponta para a pilha, a memória de "voltar de onde parei" |
| **PC** | aponta para a próxima instrução a executar |
| **PB** e **DB** | os bancos (ver memória) do código e dos dados |
| **D** (página direta) | um atalho para uma região da memória acessada com frequência |
| **P** (flags) | bandeirinhas de estado: deu zero? deu negativo? estourou? |

### 3.2 8 ou 16 bits? Os dois!

O truque do 65816 é que ele pode trabalhar em **8 bits** (como o 6502) ou em
**16 bits**, e muda isso no meio do programa, com duas bandeirinhas em P:

- **M** decide se o acumulador A tem 8 ou 16 bits;
- **X** decide se os índices X e Y têm 8 ou 16 bits.

Além disso, ele liga num **modo de emulação** que imita um 6502. Todo jogo de
SNES começa nesse modo e a primeira coisa que faz é trocar para o modo
"nativo". A mesma instrução (`LDA`, carregar em A) lê 1 ou 2 bytes conforme
a bandeira M. Para o emulador, isso significa que **não dá para saber o
tamanho de uma instrução só olhando para ela**: tem que olhar o estado.

### 3.3 Endereços de 24 bits

O 6502 enxergava só 64 KB de memória. O 65816 tem endereços de **24 bits**:
enxerga **16 MB**. O endereço é dividido em **banco** (o byte de cima) e
**posição dentro do banco**:

```
   $7E:2000
    │   └── posição dentro do banco (0000–FFFF, 64 KB)
    └────── banco (00–FF, 256 bancos)
```

### 3.4 Interrupções

Uma **interrupção** é um "toque no ombro": a CPU para o que está fazendo, pula
para uma rotina especial e depois volta. As duas que importam no SNES:

- **NMI**: disparada pela PPU **no começo do VBlank**, todo quadro. É o
  "agora você pode mexer no vídeo".
- **IRQ**: disparada quando a contagem chega numa linha ou ponto escolhido
  pelo jogo. Serve para efeitos no meio da tela, como trocar o cenário de uma
  barra de status.

### 3.5 Ajudantes de conta

O 65816 não sabe multiplicar nem dividir. Para isso, o 5A22 tem uma
**unidade de multiplicação e divisão** separada: o jogo escreve os números
em registradores especiais e, alguns ciclos depois, lê o resultado.

---

## 4. A memória e o mapa de endereços

Para a CPU, *tudo* é um endereço: a memória de trabalho, os registradores da
PPU, as caixas de correio do som, a ROM do cartucho. Escrever no endereço
`$2100` não guarda nada em memória; **liga e desliga a tela**. Isso se chama
**I/O mapeado em memória**.

O mapa simplificado (bancos `$00–$3F`, espelhados em `$80–$BF`):

| Endereço | O que está lá |
|---|---|
| `$0000–$1FFF` | os primeiros 8 KB da WRAM (atalho rápido) |
| `$2100–$213F` | **registradores da PPU** (vídeo) |
| `$2140–$2143` | **as 4 caixas de correio da APU** (som) |
| `$2180–$2183` | porta de acesso à WRAM inteira |
| `$4016–$4017` | controles, no modo "à moda antiga" |
| `$4200–$421F` | registradores da CPU: interrupções, multiplicação, leitura automática do controle |
| `$4300–$437F` | os **8 canais de DMA** |
| `$8000–$FFFF` | **ROM do cartucho** |

E os bancos `$7E–$7F` são a **WRAM inteira, 128 KB**: a memória do jogo.

Ler a ROM pode ser "lento" (8 tiques mestres) ou "rápido" (6 tiques, os
cartuchos **FastROM**), e os registradores do controle são os mais lentos
(12). Um emulador que erra esses tempos faz o jogo rodar com a velocidade
certa no geral, mas com a música, os efeitos de meio de tela ou a física
levemente fora do lugar.

### Onde tudo começa: os vetores

No fim do banco 0 (`$FFE0–$FFFF`) ficam os **vetores**: endereços para onde a
CPU pula em cada situação. O mais importante é o **vetor de reset** (`$FFFC`):
quando você liga o console, a CPU lê esses dois bytes e começa a executar o
jogo dali. Logo antes (`$FFC0`) fica o **cabeçalho**: o nome do jogo, o tipo
de mapeamento, o tamanho da ROM e da SRAM. É daí que o KOFnes tira o nome que
aparece na barra de status.

---

## 5. O cartucho

Um cartucho de SNES é, basicamente:

- **ROM**: o jogo, de 256 KB a 6 MB (Super Mario World tem 512 KB; Star Ocean,
  6 MB). Só leitura;
- **SRAM + bateria** (nem todos): uma memória pequena (2 a 128 KB) que a
  bateria de relógio mantém ligada com o console desligado. É o **save**. Quando
  a bateria acaba, depois de uns 20 anos, o save se perde;
- **CIC**: o chip de trava regional. Ele conversa com um gêmeo dentro do
  console; se não "combinarem", o console fica reiniciando. É a trava contra
  cartucho pirata e de outra região;
- às vezes, **um chip extra** que turbina o console (seção 12).

### LoROM e HiROM

Como a ROM é encaixada no mapa de endereços depende de como a placa foi
ligada. Os dois jeitos clássicos:

- **LoROM**: a ROM aparece em pedaços de 32 KB, na metade de cima
  (`$8000–$FFFF`) de cada banco. É simples e foi o mais usado (Super Mario
  World é LoROM).
- **HiROM**: a ROM aparece em pedaços de 64 KB, ocupando bancos inteiros
  (`$C0–$FF`). Facilita jogos grandes (Chrono Trigger, Donkey Kong Country).

O emulador tem que **adivinhar** qual é olhando o cabeçalho nos dois lugares
possíveis e vendo qual faz sentido. Errar aqui significa tela preta.

---

## 6. A imagem: a PPU

A **PPU** (*Picture Processing Unit*, na verdade dois chips: PPU1 e PPU2) é o
coração visual do SNES. E ela não funciona como uma tela de computador
moderna. **Não existe uma imagem pronta na memória** que a PPU só copia para
a TV. A PPU **monta cada linha na hora**, pixel por pixel, a partir de peças.

### 6.1 Tiles: o Lego do SNES

Toda a arte do jogo é feita de **tiles**: quadradinhos de **8×8 pixels**.
Cada pixel de um tile não guarda uma cor, guarda um **número de cor**, que
depois é consultado numa **paleta**:

| Profundidade | Cores por tile | Bytes por tile |
|---|---|---|
| 2 bits por pixel (2bpp) | 4 | 16 |
| 4bpp | 16 | 32 |
| 8bpp | 256 | 64 |

A **paleta (CGRAM)** tem **256 cores**, cada uma escolhida entre **32.768**
(5 bits de vermelho, 5 de verde, 5 de azul). Trocar a paleta muda a cor de
tudo que usa ela de uma vez. É assim que um jogo faz uma cena "anoitecer" ou
um inimigo piscar quando leva dano, sem redesenhar nada.

### 6.2 Fundos (backgrounds)

Um **fundo** é uma grade de tiles, como um mosaico: o **tilemap**. Cada casa
do mapa diz *qual tile*, *qual paleta*, *se está espelhado* e *se fica na
frente ou atrás*. Um mapa típico tem 32×32 casas (256×256 pixels) e pode ser
**rolado** (scroll) suavemente em qualquer direção só mudando dois números.
É por isso que o cenário de um jogo de plataforma anda tão liso.

O SNES tem até **4 fundos** empilhados, e os **8 modos de vídeo** decidem
quantos e com quantas cores:

| Modo | Fundos | Para que se usava |
|---|---|---|
| 0 | 4 fundos de 4 cores | muitas camadas simples |
| **1** | 2 de 16 cores + 1 de 4 | **o mais usado de todos**: Mario, Zelda, Mega Man X |
| 2 | 2 de 16, com rolagem por coluna | efeitos de ondulação |
| 3 | 1 de 256 cores + 1 de 16 | telas de título com muitas cores |
| 4 | 1 de 256 + 1 de 4, com rolagem por coluna | |
| 5 e 6 | alta resolução (512 de largura) | textos finos, menus |
| **7** | 1 fundo que **gira e escala** | F-Zero, Mario Kart, Pilotwings |

Com várias camadas rolando em velocidades diferentes, o jogo cria
**paralaxe**: a montanha lá atrás anda devagar, a floresta da frente anda
rápido, e o cenário ganha profundidade.

### 6.3 Sprites: o que se mexe

Mario, os inimigos, as moedas e os tiros são **sprites** (a Nintendo chama de
OBJ). Diferente do fundo, um sprite pode ficar em **qualquer posição**, pixel
a pixel. A tabela de sprites (**OAM**, 544 bytes) guarda até **128 sprites**,
cada um com posição, tile, paleta, espelhamento e prioridade, em tamanhos de
8×8 até 64×64.

Mas há limites de hardware famosos:

- no máximo **32 sprites por linha** da tela;
- no máximo **34 pedaços de 8 pixels** de sprite por linha.

Passou disso, o que sobra **some**. É a origem do "pisca-pisca" de jogos com
muita coisa na tela: o jogo alterna quais sprites mostra a cada quadro para
todos aparecerem pelo menos metade do tempo.

### 6.4 Prioridade: quem fica na frente

Para cada pixel, a PPU olha todas as camadas (4 fundos + sprites), cada uma
com seu nível de prioridade, e escolhe a de cima que não for transparente (a
cor 0 de cada tile é "vidro"). É assim que o Mario passa *atrás* de uma
árvore e *na frente* de outra.

---

## 7. Os truques visuais: Mode 7, HDMA, transparência

O que faz o SNES parecer "mágico" para a época são alguns truques de hardware.

### 7.1 Mode 7: girar e escalar o chão

No modo 7, um único fundo gigante (**1024×1024 pixels**, 256 cores) passa por
uma **matriz de transformação**: quatro números (A, B, C, D) e um ponto
central que dizem como cada pixel da tela é buscado no mapa. Com eles dá para
**girar, aumentar, diminuir e inclinar** o cenário inteiro a cada quadro.

Sozinho, isso dá um chão que gira visto de cima. O "3D" de F-Zero e Mario
Kart vem do próximo truque.

### 7.2 HDMA: mudar as regras no meio da tela

O **HDMA** (*HBlank DMA*) é um canal automático que, **a cada linha** da tela,
durante o HBlank, escreve novos valores em registradores da PPU. É como trocar
a lente da câmera entre uma linha e outra.

- No **Mode 7**, o jogo muda a escala linha a linha: linhas de cima com o chão
  "longe" (pequeno), linhas de baixo com o chão "perto" (grande). O resultado é
  a **perspectiva** de F-Zero e Mario Kart.
- Com a **paleta**, linha a linha, saem os **degradês de céu** (pôr do sol).
- Com a **rolagem**, linha a linha, saem **ondulações** de água e calor.

### 7.3 Transparência e janelas

A PPU pode **somar ou subtrair** as cores de duas camadas, pixel a pixel
(*color math*). É assim que se faz água semitransparente, sombra, névoa,
neblina e os efeitos de luz de Super Metroid.

As **janelas** são duas faixas horizontais, que podem mudar de largura a cada
linha via HDMA, dentro ou fora das quais uma camada aparece ou some. Servem
para holofotes circulares, transições "fechando em círculo" e cortes de tela.

Tem ainda o **mosaico** (a tela "pixeliza" nas transições) e o **brilho
mestre**, que escurece tudo para os *fade-ins* e *fade-outs*.

---

## 8. O som: um computador inteiro só pra música

O som do SNES é a parte mais curiosa do console. A **APU** não é um chip de
som; é **um computador separado**, feito pela Sony (sim, a mesma do
PlayStation, e foi lá que Ken Kutaragi começou essa história):

- **SPC700**: um processador de 8 bits, com instruções próprias, a ~1 MHz;
- **ARAM**: **64 KB** de memória só dele, onde ficam o programa de música, as
  notas e os sons;
- **S-DSP**: o chip que efetivamente gera o som.

### 8.1 Como a música chega lá

A CPU principal **não consegue tocar o som**, nem escrever direto na memória
do som. As duas só conversam por **4 caixas de correio** de 1 byte cada
(`$2140–$2143`): uma escreve, a outra lê.

Ao ligar, o SPC700 roda um pequeno programa de fábrica (o **IPL**, 64 bytes)
que espera dados nas caixas de correio. O jogo então manda, byte a byte, o seu
**driver de som** (o programa que sabe tocar música), os **instrumentos** e as
**músicas**. Depois disso, a CPU só manda recados curtos: "toque a música 3",
"faça o som do pulo". O SPC700 cuida de todo o resto **sozinho**.

### 8.2 O DSP: 8 vozes com samples

O DSP toca **8 vozes ao mesmo tempo**, em **estéreo**, a **32.000 amostras
por segundo**. E, ao contrário do Mega Drive (que *sintetiza* o som com FM), o
SNES toca **samples**: gravações curtas de instrumentos de verdade. É por isso
que a trilha do SNES tem cordas, pianos e corais que soam "orquestrais".

Cada voz tem:

- um **sample** comprimido em **BRR** (cada 9 bytes viram 16 amostras de som),
  o que é essencial para caber tudo em 64 KB;
- **altura** (pitch): o mesmo sample tocado mais rápido ou mais devagar vira
  outras notas;
- **envelope (ADSR)**: como o som nasce, sustenta e morre (o ataque seco de um
  piano ou o crescendo lento de um violino);
- **volume** separado para esquerda e direita.

E o DSP tem um efeito de **eco** com filtro (FIR de 8 coeficientes), que dá
aquela "sala" e reverberação típicas de Donkey Kong Country e Chrono Trigger.

### 8.3 Por que isso importa para uma Jukebox

Como a música inteira vive na APU (programa, notas e instrumentos nos 64 KB),
**basta guardar o estado da APU** para tocar a trilha de um jogo sem o jogo.
É exatamente o que é um arquivo **.SPC**: uma "foto" da APU. É também a base da
ideia de Jukebox do KOFnes.

---

## 9. O controle

O controle do SNES tem **12 botões**: direcional (4), A, B, X, Y, L, R,
Start e Select. Por dentro, ele é bem simples: um **registrador de
deslocamento** (*shift register*), um chip que guarda o estado dos botões e
entrega **um bit por vez**, numa fila.

1. O console manda um pulso de **"trava"** (*latch*): o controle tira uma
   "foto" de todos os botões naquele instante.
2. Depois, a cada pulso de relógio, o controle entrega o próximo bit na ordem
   **B, Y, Select, Start, Cima, Baixo, Esquerda, Direita, A, X, L, R**.

Fazer isso à mão, bit a bit, dá trabalho, então o 5A22 tem a **leitura
automática**: no começo do VBlank ele lê os dois controles sozinho e deixa os
16 bits prontos em `$4218–$421B`. O jogo só pega o número pronto.

Essa mesma ordem de bits é a que o KOFnes usa por dentro (`B = 0x8000`,
`Y = 0x4000`, … `R = 0x0010`), e é por isso que o mapeamento de teclas e o
controle USB "falam a mesma língua" do console.

---

## 10. DMA: o caminhão de mudança

Copiar dados byte a byte pela CPU é lento. No VBlank o tempo é curtíssimo, e o
jogo precisa mandar para a PPU novos tiles, o mapa do cenário, a tabela de
sprites e a paleta. Para isso existe o **DMA** (*Direct Memory Access*): o
jogo configura um dos **8 canais** com origem, destino e tamanho, dá a ordem,
e o hardware copia tudo na velocidade máxima do barramento (~2,7 MB/s),
**com a CPU parada esperando**.

Existem dois tipos:

- **DMA geral**: "copie esses 4 KB da ROM para a VRAM, agora". Usado no
  VBlank.
- **HDMA**: o que vimos na seção 7, poucos bytes **por linha**, automático,
  durante o desenho do quadro.

---

## 11. Um quadro na vida do SNES

Juntando tudo, eis o que acontece em **1/60 de segundo** de um jogo típico.

**1. A PPU começa a desenhar.** Linha 1, pixel 0. Para cada pixel, ela
consulta os tilemaps, busca os tiles na VRAM, olha a paleta, escolhe a
camada da frente, aplica a transparência e manda a cor para a TV. Isso se
repete por **224 linhas × 256 pixels = 57.344 pixels**. Entre uma linha e
outra, o HDMA pode trocar a escala do Mode 7, a cor do céu ou a rolagem.

**2. Enquanto isso, a CPU roda a lógica do jogo:**
   - lê o controle (o resultado que a leitura automática deixou pronto);
   - move o Mario, aplica a gravidade, testa colisões;
   - move os inimigos, conta o tempo, a pontuação;
   - **monta numa cópia em WRAM** a nova tabela de sprites e as mudanças do
     cenário. Ainda não pode mandar para a PPU, porque ela está desenhando.

   Quando termina, a CPU **espera**, num laço que não faz nada.

**3. Linha 225: começa o VBlank.** A PPU para de desenhar e dispara a **NMI**.
A CPU pula para a rotina de VBlank e, correndo contra o relógio (pouco mais
de 1 milissegundo):
   - usa **DMA** para mandar a nova tabela de sprites para a OAM;
   - manda os tiles novos e os pedaços de cenário que mudaram para a VRAM;
   - atualiza a paleta, a rolagem e a configuração de HDMA do próximo quadro.

**4. Ao mesmo tempo, sem esperar ninguém, a APU está tocando.** O SPC700 lê a
partitura, avança as notas no tempo certo e manda o DSP tocar as 8 vozes,
gerando 32 mil amostras estéreo por segundo. De vez em quando a CPU deixa um
recado na caixa de correio: "som do pulo".

**5. Linha 0 de novo.** O quadro seguinte começa, com tudo atualizado.

```
 tempo ─────────────────────────────────────────────────────────▶
 PPU   │███████ desenha 224 linhas ███████│ VBlank  │████ desenha ...
 CPU   │ lógica do jogo ... │ espera... │ NMI: DMA │ lógica ...
 HDMA  │ ▪ ▪ ▪ ▪ ▪ ▪ (um pouquinho a cada linha) ▪ │  │ ▪ ▪ ▪ ▪
 APU   │ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ (no seu próprio ritmo, sempre) ♪ ♪ ♪ ♪ ♪
```

Quando o jogo tem coisa demais para calcular e a lógica **não termina antes do
VBlank**, a CPU perde o "trem" daquele quadro e o jogo fica mais lento. É o
famoso **slowdown** de Gradius III e de partes de Super Mario World. O
slowdown não é defeito do emulador; acontecia no console de verdade.

---

## 12. Os chips extras dos cartuchos

Como o processador do SNES era modesto, a Nintendo e outras empresas
colocaram **chips extras dentro de alguns cartuchos**. O console trata
esses chips como mais um pedaço do mapa de endereços.

| Chip | O que faz | Jogos famosos |
|---|---|---|
| **Super FX (GSU)** | um processador RISC rápido para desenhar polígonos e efeitos | Star Fox, Stunt Race FX, Yoshi's Island (Super FX 2) |
| **SA-1** | outro 65816, só que ~3× mais rápido, trabalhando junto | Super Mario RPG, Kirby Super Star |
| **DSP-1** | contas de matriz e trigonometria para o Mode 7 | Super Mario Kart, Pilotwings |
| **Cx4** | contas de geometria (wireframe, rotação) | Mega Man X2 e X3 |
| **S-DD1** | descomprime gráficos em tempo real | Star Ocean, Street Fighter Alpha 2 |
| **SPC7110** | descompressão + relógio | Far East of Eden Zero |

Para o emulador, cada chip desses é **um mini-emulador a mais**. O KOFnes já
tem o Super FX (o arquivo `Gsu.kf`).

---

## 13. Por que emular é difícil

Emular é fazer um programa que **finge ser** cada um desses chips, com
precisão suficiente para o jogo não perceber a diferença. O difícil não é
cada chip isolado; é **o conjunto**:

- **Tudo acontece ao mesmo tempo.** No console, CPU, PPU, DMA e APU andam em
  paralelo. No computador, o emulador roda um de cada vez, em pedacinhos, e
  precisa intercalar no ritmo certo. Se a CPU anda "muito à frente" da PPU,
  um efeito de meio de tela sai na linha errada.
- **Os jogos dependem de detalhes.** Programadores de 1993 testavam no
  hardware de verdade, não em manual. Se um jogo funcionava por causa de um
  comportamento esquisito (ler um registrador "aberto" devolve o último valor
  que passou no barramento, por exemplo), o jogo passou a depender disso.
- **Tempo é tudo.** Quantos tiques cada instrução gasta, quando exatamente a
  NMI dispara, quanto tempo o DMA pausa a CPU. Errar por poucos tiques já faz
  um jogo travar numa tela específica.
- **Precisão custa velocidade.** Emuladores antigos (ZSNES, o primeiro
  Snes9x) usavam atalhos para rodar nos PCs dos anos 90 e tinham listas de
  "correções por jogo". O bsnes/higan foi o primeiro a buscar **precisão por
  ciclo**, simulando cada tique, e por isso exige muito mais do computador.

Por isso todo emulador tem uma **lista de compatibilidade** e testes como os
do PeterLemon, do undisbeliever e do blargg, que verificam um comportamento
de cada vez.

---

## 14. Do console ao KOFnes

O KOFnes segue essa mesma divisão do hardware. Cada chip virou um arquivo em
Kof, na pasta `snes/`:

| No console | No KOFnes | O que o arquivo faz |
|---|---|---|
| a placa e o relógio | `Snes.kf` | liga tudo e roda um quadro (`runFrame`) |
| CPU 65816 | `Cpu.kf` | as ~256 instruções, os modos de 8/16 bits, as interrupções |
| o barramento da CPU, DMA, HDMA, WRAM, registradores `$42xx` | `CpuBus.kf` | o mapa de endereços: "ler `$2100`" vira "falar com a PPU" |
| cartucho (LoROM/HiROM, SRAM) | `Cartridge.kf` | lê o cabeçalho, decide o mapeamento, guarda o save |
| PPU 1 e 2 | `Ppu.kf` | tiles, fundos, sprites, Mode 7, janelas, transparência |
| SPC700 | `Spc.kf` | o processador do som e as suas instruções |
| o barramento do som | `SpcBus.kf` | a ARAM, as caixas de correio, os timers |
| S-DSP | `Dsp.kf` | as 8 vozes, BRR, envelopes, eco |
| APU (o conjunto) | `Apu.kf` | junta o SPC700 e o DSP no ritmo certo |
| Super FX | `Gsu.kf` | o processador extra de Star Fox e Yoshi's Island |

E o que a interface (`web/`) acrescenta não existe no console: biblioteca,
savestates, rebobinar, temas, filtros, molduras, estatísticas. Tudo isso
funciona **olhando de fora** para esses objetos. O savestate, por exemplo,
fotografa o estado de cada chip: os registradores da CPU, a WRAM, a VRAM, a
paleta, a OAM, a ARAM e as vozes do DSP. Como o núcleo é determinístico, voltar
essa foto é voltar no tempo.

---

## 15. Glossário rápido

| Termo | Significado |
|---|---|
| **APU** | a unidade de áudio: SPC700 + DSP + 64 KB de memória |
| **ARAM** | a memória do som (64 KB) |
| **Banco** | cada "fatia" de 64 KB do espaço de endereços de 16 MB |
| **BRR** | o formato de sample comprimido do SNES (9 bytes → 16 amostras) |
| **CGRAM** | a paleta: 256 cores de 15 bits |
| **Ciclo / tique** | um passo do relógio |
| **DMA / HDMA** | cópia automática de dados: em bloco / linha a linha |
| **FastROM / SlowROM** | cartucho com memória rápida (6 tiques) ou lenta (8) |
| **HBlank / VBlank** | as folgas no fim de cada linha / de cada quadro |
| **LoROM / HiROM** | os dois jeitos clássicos de ligar a ROM no mapa de memória |
| **Mode 7** | o modo de vídeo que gira e escala um fundo |
| **NMI / IRQ** | interrupções: no VBlank / numa linha escolhida |
| **OAM** | a tabela de sprites (128 sprites) |
| **PPU** | a unidade que monta a imagem |
| **Registrador** | uma gaveta interna da CPU, ou um endereço especial de um chip |
| **SRAM** | a memória do save, mantida por bateria |
| **Sprite (OBJ)** | um objeto móvel: personagem, inimigo, tiro |
| **Tile** | um quadradinho de 8×8 pixels, a peça básica dos gráficos |
| **Tilemap** | a grade que diz qual tile vai em cada lugar do fundo |
| **VRAM** | a memória de vídeo (64 KB): tiles e tilemaps |
| **WRAM** | a memória de trabalho da CPU (128 KB) |

---

### Para ir mais fundo

- **Fullsnes**, do nocash: a "bíblia" técnica do SNES, registrador por
  registrador.
- **SNESdev Wiki**: documentação da comunidade, com tutoriais.
- **Testes do PeterLemon e do undisbeliever** (GitHub): ótimos para ver cada
  recurso funcionando sozinho.
- Os vídeos do **Retro Game Mechanics Explained** (YouTube) sobre Mode 7 e
  sobre o som do SNES, que mostram em animação o que este texto descreve.

*Próximo capítulo: como o KOFnes emula cada uma dessas peças, e como o código
Kof vira um quadro na sua tela.*
