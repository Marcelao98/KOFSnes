<p align="center">
  <img src="docs/banner.png" alt="KOFnes: um Super Nintendo inteiro, escrito em Kof" width="100%">
</p>

<p align="center">
  <img alt="feito em Kof" src="https://img.shields.io/badge/feito%20em-Kof%200.6.3-c08552?style=flat-square&labelColor=2b1d14">
  <img alt="Windows" src="https://img.shields.io/badge/roda%20em-Windows%20(Edge)-d9b99b?style=flat-square&labelColor=2b1d14">
  <img alt="tamanho" src="https://img.shields.io/badge/tamanho-~500%20KB-6f4e37?style=flat-square&labelColor=2b1d14">
  <img alt="cputest 649/649" src="https://img.shields.io/badge/cputest-649%2F649-6f4e37?style=flat-square&labelColor=2b1d14">
</p>

# ☕ KOFnes

**Um Super Nintendo escrito inteiro em [Kof](https://github.com/KofLang/Kof4j), uma linguagem brasileira com poucos meses de vida, e feito pra facilitar a sua jogatina.**

Dois cliques no `KOFnes.exe` e você cai numa tela de Início bonita, com a sua biblioteca de jogos, capas, savestates com print, rebobinar o tempo, jukebox, 125 temas e até um caçador de bugs. Tudo isso num arquivo de ~500 KB.

<p align="center">
  <img src="docs/prints/inicio-4-telas.jpg" alt="A tela de Início do KOFnes em quatro situações: primeira vez, jogo pausado, tema Clássico 98 e tema Matrix" width="100%">
  <br><sub>A tela de Início muda conforme o momento (primeira vez, jogo pausado, continuar) e conforme o tema.</sub>
</p>

## ✨ O que ele faz

| | |
|---|---|
| 🏠 **Início** | continuar de onde parou (com print), jogados recentemente, atalhos e dica do dia. Até a frase de boas-vindas muda com o tema |
| 🧭 **Navegação** | menu lateral, botão **Voltar** com histórico (`Alt+←`, `Esc`, botão voltar do mouse) e um **Guia do KOFnes** dentro do próprio emulador |
| 📚 **Biblioteca** | estilo ZSNES: escolha a pasta de ROMs uma vez, busque por palavras em qualquer ordem, esconda hacks e variantes com **Só os principais**, capas oficiais ([libretro-thumbnails](https://github.com/libretro-thumbnails)) e **modo sofá** (grade de capas pra jogar de longe, com o controle) |
| 🎨 **125 temas** | oito jeitos de café, jogos, animais, consoles, Windows antigo, internet de 1999, anime, bem brasileiro Animes, 20 de Nostalgia BR, 20 de Brasilidades e 20 Clássicos do SNES, com galeria de prévias ao vivo |
| 📺 **Imagem** | filtros WebGL (nítido, suave, CRT, fliperama, Game Boy, sépia, LCD), proporção 4:3 / 8:7 / esticar, tela cheia de verdade e **molduras** |
| 💾 **Savestates** | por jogo, com print do momento, e **salvar automático** pra continuar de onde parou |
| ⏪ **Rebobinar** | deu ruim? segure `Backspace` (ou `Select+Y`) e o jogo volta no tempo, em preto e branco, até 5 s. Depois uma ampulheta ⏳ recarrega enquanto você joga, estilo Príncipe da Pérsia |
| 🎵 **Jukebox** | `F7` guarda a música que está tocando; abre e exporta `.spc`; mostra as 8 vozes do chip de som ao vivo e deixa silenciar cada uma |
| 📊 **Estatísticas** | tempo jogado por jogo, sessões, primeira e última vez e o gráfico dos últimos 7 dias |
| 🐞 **Caçador de bugs** | `F9` abre uma issue no GitHub já preenchida, com um pacote pra reproduzir o bug quadro a quadro |
| 🎮 **Conforto** | controle USB/Xbox, volume, mudo, turbo, pausa sozinho quando você sai da janela, teclas configuráveis |

### 🎨 Temas pro seu gosto

<p align="center">
  <img src="docs/prints/inicio-temas.jpg" alt="A tela de Início em oito temas diferentes" width="100%">
</p>

A galeria deixa você experimentar passando o mouse e escolher com um clique:

<p align="center">
  <img src="docs/prints/galeria-temas.jpg" alt="Galeria de temas com prévia ao vivo" width="62%">
  &nbsp;
  <img src="docs/prints/menu-lateral-classico98.jpg" alt="Tema Clássico 98 com o menu lateral aberto" width="36%">
</p>

### 📚 Biblioteca, modo sofá e molduras

<p align="center">
  <img src="docs/prints/biblioteca-modo-sofa.jpg" alt="Biblioteca em modo sofá, com grade de capas" width="100%">
</p>

Cada jogo ganha capa oficial, baixada uma vez e guardada. Com o controle na mão, `Select` alterna pro modo sofá. Na tela de jogo, o menu **Imagem → Moldura** coloca o jogo numa TV de madeira dos anos 80, numa TV de tubo dos anos 90 ou num fliperama:

<p align="center">
  <img src="docs/prints/molduras.jpg" alt="Molduras: TV de madeira, TV de tubo e fliperama" width="100%">
</p>

### 🎵 Jukebox, estatísticas e guia

<p align="center">
  <img src="docs/prints/jukebox.jpg" alt="Jukebox com as 8 vozes do chip de som" width="49%">
  <img src="docs/prints/estatisticas.jpg" alt="Estatísticas de tempo jogado" width="49%">
</p>
<p align="center">
  <img src="docs/prints/guia-embutido.jpg" alt="Guia do KOFnes embutido no emulador" width="62%">
</p>

## 🎮 Como jogar

1. Baixe a pasta [`publicado/`](publicado/) (`KOFnes.exe` e `KOFnes.html`, juntos) ou o zip gerado pelo `web/compilar.sh`, e deixe num lugar seu (Documentos, Área de Trabalho), **não** em *Arquivos de Programas*.
2. Dois cliques no **`KOFnes.exe`**. Ele abre o emulador numa janela do Microsoft Edge (que já vem no Windows 10 e 11) sem barra de endereço. Também dá pra abrir o `KOFnes.html` direto no Chrome ou no Edge.
3. **Arquivo → Escolher pasta de ROMs** e pronto: a lista aparece dentro do emulador (`Ctrl+L`). Ou arraste uma ROM (`.sfc`, `.smc` ou `.zip`) pra janela.

> Na primeira vez o Windows pode dizer *"o Windows protegeu o computador"*: o `.exe` não tem assinatura digital. Clique em **Mais informações → Executar assim mesmo**.

### ⌨️ Atalhos principais

| Ação | Tecla | Ação | Tecla |
|---|---|---|---|
| Direcional | setas | Salvar / carregar estado | `F5` / `F8` |
| B · A | `Z` · `X` | Galeria de estados | `F6` |
| Y · X | `A` · `S` | Rebobinar | segurar `Backspace` |
| L · R | `Q` · `W` | Guardar música (Jukebox) | `F7` |
| Start · Select | `Enter` · `Shift` | Reportar bug | `F9` |
| Pausa · Reiniciar | `P` · `F1` | Menu rápido | botão direito, `F2` ou `Select+Start` |
| Turbo | segurar `Tab` | Biblioteca · Voltar | `Ctrl+L` · `Alt+←` |
| Tela cheia · Mudo | `F11` ou duplo clique · `M` | Volume | `-` e `=` |

No controle: `Select+L` salva, `Select+R` carrega e `Select+Y` rebobina. As teclas mudam em **Emulação → Configurar teclas**. Os saves de bateria ficam sozinhos no perfil do KOFnes (`%LOCALAPPDATA%\KOFnes`).

## 🔄 Atualiza sozinho

Ao abrir, o `KOFnes.exe` confere no GitHub (`publicado/versao.txt`) se existe versão nova e baixa o `KOFnes.html` atualizado, conferindo o tamanho antes de abrir a janela. Leva uns segundos; sem internet, abre normal. Saves, estados e biblioteca não se perdem.

- O que o atualizador fez fica anotado em `atualizacao.log`.
- Pra desligar, crie um arquivo chamado `nao-atualizar` na pasta.
- Também tem **Ajuda → Procurar atualização**.

## 🐞 Caçador de bugs

Achou um bug? Aperte `F9` (ou deixe o emulador oferecer sozinho quando ele quebrar). O KOFnes abre uma issue **já preenchida** (jogo, SHA-1, versão, navegador, erro) e baixa um pacote `kofbug` com o savestate de segundos antes e os botões apertados, quadro a quadro. É só arrastar o pacote pra dentro da issue. A ROM não vai junto.

<p align="center">
  <img src="docs/prints/cacador-de-bugs.jpg" alt="Janela do caçador de bugs oferecendo abrir uma issue no GitHub" width="70%">
</p>

Pra reproduzir em outra máquina: `node bugs/reproduzir.cjs KOFnes.html kofbug-....json.gz minha-rom.sfc` chega exatamente na mesma imagem.

## 🔧 Por dentro

O núcleo do console é **Kof puro**, sem nenhuma biblioteca de emulação:

| Peça | Arquivo | O que faz |
|---|---|---|
| CPU 65C816 | `snes/Cpu.kf` | os 256 opcodes, modos nativo e emulação, tempo por acesso à memória |
| PPU | `snes/Ppu.kf` | modos 0 a 7 (com Mode 7), sprites, janelas, color math, mosaico, hi-res |
| SPC700 + DSP + APU | `snes/Spc.kf`, `Dsp.kf`, `Apu.kf` | a CPU e o chip de som: 8 vozes BRR, ADSR, eco, 3 timers |
| Barramento | `snes/CpuBus.kf`, `Snes.kf` | mapa de memória, DMA/HDMA, IRQ/NMI, joypad |
| Cartucho | `snes/Cartridge.kf` | LoROM, HiROM e ExHiROM |
| Super FX | `snes/Gsu.kf` | o chip do *Star Fox* e do *Yoshi's Island* |

O KOFnes roda direto no navegador: `web/compilar.sh` compila o mesmo `snes/` com `kof build --target js` e junta tudo num `KOFnes.html` de ~500 KB (zip de ~150 KB). O `KOFnes.exe` é um lançador pequeno em C que abre essa página numa janela do Edge. A saída é idêntica bit a bit à da versão em JVM, a 60 fps.

```
KOFnes/
├── snes/        o console em Kof: Cpu, Ppu, Spc, Dsp, Apu, Snes, Cartridge, Gsu
├── web/         núcleo → JavaScript, interface, temas, lançador do .exe
├── publicado/   a versão que o atualizador baixa (KOFnes.exe, .html, versao.txt)
├── bugs/        reproduzir.cjs: roda os pacotes do caçador de bugs
├── app/         janela da versão com Java       ├── nativo/   versão só-Kof (SDL2)
├── tools/       testes de CPU/SPC e modo headless
└── docs/        como o SNES funciona, relatórios de bugs do Kof e reproduções
```

### Como compilar

Precisa do [Kof](https://github.com/KofLang/Kof4j) **0.6.3** com o `web/kof-js-correcoes.patch` aplicado (4 correções no alvo JS do compilador), de `python3` e, pro `.exe`, do `mingw-w64`.

```bash
web/compilar.sh     # gera dist/web/KOFnes.html, KOFnes.exe e o zip
web/publicar.sh     # sobe a versão pra publicado/ (depois é só commitar)
```

### Outras versões (laboratório da linguagem)

O mesmo núcleo também roda com **Java** (instalador pra Windows e pacote pra Linux, 350 a 500 fps sem janela) e em **Kof nativo** pra Linux (0,3 MB, mas ~22 fps, porque o compilador nativo ainda é jovem). Elas existem pra testar a linguagem e estão em `app/`, `empacotar/` e `nativo/`, com `./kofnes.sh` pra rodar a partir do código.

### Como foi testado

Cada peça foi medida contra suítes públicas: **cputest do gilyon 649/649**, **SingleStepTests SPC700 76.200/76.200**, **SingleStepTests 65816 151.194/152.400** (o resto é MVN/MVP e um quirk em que o KOFnes segue o hardware), além das ROMs de teste do PeterLemon e do undisbeliever. Pra entender o hardware: [`docs/como-o-snes-funciona.md`](docs/como-o-snes-funciona.md).

## 💜 Kof e a Mel

O Kof é uma linguagem brasileira nova, da **Mel Santos**: [github.com/KofLang/Kof4j](https://github.com/KofLang/Kof4j). Escrever um emulador inteiro nela foi um teste e tanto, e a linguagem aguentou muito bem. No caminho apareceram alguns bugs do compilador, todos com reprodução mínima:

- 📄 [Relatório pra humanos](docs/relatorio-kof.md) e 🤖 [relatório pra IA](docs/relatorio-kof-ia.md)
- 🧪 [Reproduções](docs/kof-repros/): um `main.kf` por problema, cada um roda com `kof run main.kf`
- 📝 [Issues prontas](docs/issues/README.md): 19 bugs já formatados pra abrir no repositório do Kof

## 🚀 Próximos passos

- [ ] 📱 Versão pra **Android** e pra navegador (GitHub Pages), já que o núcleo é JavaScript
- [ ] 🐧 **Linux** com lançador próprio, como o do Windows
- [ ] 🕹️ **Multi-sistema**: NES, Game Boy e Mega Drive na mesma biblioteca
- [ ] 🏆 **Conquistas**
- [ ] Chips de cartucho que faltam: SA-1, DSP-1, Cx4, S-DD1, SPC7110

## ⚖️ Aviso

O KOFnes **não inclui ROMs** nem ensina onde baixar. Use cópias dos seus próprios cartuchos.

## Créditos

Linguagem: [Kof / Kof4j](https://github.com/KofLang/Kof4j), da Mel Santos e contribuidores. Testes: [SingleStepTests](https://github.com/SingleStepTests), [gilyon](https://github.com/gilyon/snes-tests), [PeterLemon](https://github.com/PeterLemon/SNES), [undisbeliever](https://github.com/undisbeliever/snes-test-roms). Capas: [libretro-thumbnails](https://github.com/libretro-thumbnails). Versão só-Kof: [SDL2](https://www.libsdl.org/) (zlib).
