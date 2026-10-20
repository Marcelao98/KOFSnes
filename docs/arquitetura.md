# Arquitetura do KOFstation

Este documento explica como o KOFstation funciona por dentro, do arquivo da ROM até o som saindo da caixa. É pra ler
com calma, daqui a meses, quando precisar mexer em alguma parte e não lembrar mais por que ela é do jeito que é.
No fim tem um glossário com os termos técnicos.

## 1. Visão geral: as camadas

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Lançador        KOFstation.exe (Windows) · kofnes.sh (Linux) · APK (Android)  │
│                 atualiza os arquivos e abre o html numa janela de app         │
├──────────────────────────────────────────────────────────────────────────────┤
│ Interface       web/app.js (+ android.js no celular), pagina.html, estilo.css │
│                 biblioteca, menus, temas, savestates, rebobinar, jukebox...    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Adaptador       web/nucleo.js (KofLibretro): faz todo núcleo parecer o Kof    │
├──────────────────────────────────┬───────────────────────────────────────────┤
│ Núcleo Kof (só SNES no PC)       │ Núcleos libretro em WebAssembly           │
│ snes/*.kf → JavaScript           │ nucleos/<núcleo>-<hash>.js                │
│ (dentro do html)                 │ ponte.cpp + Snes9x/Gambatte/FCEUmm/GPGX   │
└──────────────────────────────────┴───────────────────────────────────────────┘
```

Tudo roda dentro de um navegador (Edge/Chrome no PC, WebView no Android). O "programa" é um arquivo html grande com
todo o JavaScript dentro, mais a pasta `nucleos/` ao lado. O lançador é só um ajudante: atualiza esses arquivos e abre
o html sem barra de endereço.

Por que no navegador? Porque assim um código só roda no Windows, no Linux e no celular, com vídeo acelerado (WebGL),
som, controle USB e banco de dados (IndexedDB) de graça, sem instalar nada.

## 2. O núcleo Kof (SNES no PC)

`snes/` é o emulador de Super Nintendo escrito em Kof (~5.600 linhas): `Cpu.kf` (processador 65816), `Ppu.kf` (vídeo),
`Spc.kf` + `Dsp.kf` (o chip de som SPC700 e o sintetizador), `CpuBus.kf`/`Snes.kf` (barramento, DMA, interrupções),
`Cartridge.kf` (mapas de memória dos cartuchos) e `Gsu.kf` (Super FX).

O compilador Kof tem um alvo JavaScript (`kof build --target js`). O `web/compilar.sh` compila o núcleo e o
`web/juntar.py` cola o resultado dentro do html. Duas coisas importantes:

- **Patch no compilador** (`web/kof-js-correcoes.patch`): o alvo JS do Kof 0.6.3 tinha bugs que quebravam o núcleo.
  Sem o patch, não funciona. Ver `CLAUDE.md` pra montar o compilador.
- **Modo rápido**: o runtime do Kof confere os limites de cada acesso a array; o `juntar.py` troca isso por acesso
  direto (o núcleo já mascara todos os índices). Ganho de ~50% nos quadros pesados, mesma saída bit a bit.

No celular o SNES usa o Snes9x (libretro), porque o núcleo Kof em JavaScript é pesado demais pra um celular comum.

## 3. libretro: um "encaixe" padrão para emuladores

libretro é uma interface em C que muitos emuladores implementam (o RetroArch é o programa mais famoso que usa). Um
núcleo libretro é um emulador "sem cara": não abre janela, não toca som, não lê teclado. Ele só oferece funções como:

- `retro_load_game(rom)`: carrega o jogo;
- `retro_run()`: emula UM quadro (1/60 s) e devolve a imagem e o som desse quadro por *callbacks*;
- `retro_serialize()`/`retro_unserialize()`: tira e põe uma "foto" do estado inteiro (savestate);
- `retro_get_system_av_info()`: tamanho da tela, quadros por segundo, taxa do áudio.

Quem usa o núcleo (o "frontend") responde às perguntas dele pela função *environment* (que formato de pixel, onde
está a ROM, valor das opções...). No KOFstation o frontend é a nossa **ponte**.

Núcleos usados hoje: **Snes9x** (SNES no celular, licença só não comercial), **Gambatte** (Game Boy/Color, GPL-2),
**FCEUmm** (NES, GPL-2) e **Genesis Plus GX** (Mega Drive, Master System, Game Gear; só não comercial). Cada um é
baixado do GitHub do libretro num commit fixo (`nucleo-libretro/construir.sh`).

## 4. WebAssembly e a ponte

O núcleo é C/C++. Pra rodar no navegador, o **emscripten** compila C/C++ para **WebAssembly** (wasm): um código de
máquina portátil que o navegador executa quase na velocidade do nativo (o Mega Drive roda a ~810 quadros por segundo
no servidor de testes; o jogo precisa de 60).

`nucleo-libretro/construir.sh <núcleo>`:

1. clona o núcleo no commit fixo e aplica o nosso remendo da **sonda** (`<núcleo>-sonda.patch`, ver seção 9);
2. compila o núcleo com `emmake make platform=emscripten`;
3. compila a `ponte.cpp` e junta tudo num arquivo só, `saida/<núcleo>.js`, com o wasm embutido em base64
   (`SINGLE_FILE=1`) e uma função de fábrica `Nucleo_<núcleo>()` que cria uma instância.

A **ponte** (`nucleo-libretro/ponte.cpp`) é o frontend libretro, igual pra todos os núcleos. Ela guarda o quadro de
vídeo já convertido pra RGBA, junta o áudio, guarda os botões, responde às opções, e expõe funções simples com nome
`lr_*` pro JavaScript: `lr_load`, `lr_run`, `lr_pad`, `lr_fb` (ponteiro do quadro), `lr_audio`, `lr_state_save`, `lr_var`
(opção do núcleo), `lr_sonda`/`lr_onda` (osciloscópio) e outras. O JavaScript lê a imagem e o som direto da memória do
wasm (`HEAPU8`), sem copiar à toa.

Detalhe que custou caro: núcleos novos (FCEUmm) pedem a ROM pela memória (`GET_GAME_INFO_EXT`); sem responder isso,
eles tentam abrir um arquivo que não existe e travam no primeiro quadro.

## 5. O adaptador (`web/nucleo.js`)

A interface (`app.js`) nasceu falando com o núcleo Kof: `pad`, `runFrame()`, `ppu.frame`, `apu.dsp`, `cart.sram`,
`reset()`. Em vez de reescrever a interface, o `KofLibretro` faz cada núcleo libretro **imitar** o núcleo Kof (a classe
`Consolinho`). Assim, savestate, rebobinar, caçador de bugs, biblioteca e jukebox funcionam pra qualquer console.

- `SISTEMAS`: o que cada console é (extensões, núcleo, tamanho da tela, botões, canais de som, opções padrão).
- `criar(bytes, nome)`: descobre o console pela extensão, carrega o núcleo, carrega a ROM.
- `titulo(rom, sis)`: nome do jogo (cabeçalho do cartucho; NES/SMS/GG não têm, vira "NES " + CRC32).
- Botões: o app usa os bits do controle do SNES; `LIGACAO` traduz pros ids do libretro. Mega Drive: Y/B/A = A/B/C.
- Resolução **dinâmica** (Sega): o Mega Drive troca entre 320 e 256 de largura no meio do jogo; o adaptador percebe e
  o app ajusta a tela.
- `tocador(...)`: uma instância separada do núcleo só pra jukebox (seção 9).

## 6. Núcleos em arquivos separados (desde a branch `nucleos`)

Até a branch `sega`, todos os núcleos iam dentro do html (PC ~6,7 MB, celular ~10,7 MB) e o navegador carregava todos
ao abrir, mesmo pra jogar só SNES. Com GBA e Neo Geo chegando, isso ia ficar pesado. Agora:

- O `juntar.py` grava cada núcleo como `nucleos/<núcleo>-<hash>.js` do lado do html. O **hash** são os 8 primeiros
  caracteres do SHA-256 do conteúdo: núcleo mudou = nome mudou. Assim nunca acontece de um html novo pegar um núcleo
  velho (ou o contrário), nem o navegador usar uma cópia velha guardada em cache.
- O html leva só a lista: `ARQUIVOS = {"gambatte": "nucleos/gambatte-a540b1f5.js", ...}` (o `juntar.py` troca o marcador
  `/*{{NUCLEOS}}*/ {}` no `nucleo.js`).
- Ao abrir um jogo, `buscar(núcleo)` põe uma tag `<script src="nucleos/...">` na página e espera ela carregar. É
  `<script>` e não `fetch` porque o navegador **bloqueia `fetch` de arquivo local** (`file://`), mas deixa carregar
  script. Por isso o wasm continua embutido em base64 dentro do .js.
- Se o arquivo não estiver lá, o app avisa "faltou baixar o núcleo do Game Boy..." e continua funcionando (SNES no PC
  não depende de núcleo nenhum).

Resultado: html do PC 615 KB, do celular 658 KB; cada console só gasta memória quando é usado.

Onde os núcleos vão em cada versão:

| Versão | Onde ficam | Quem põe lá |
|---|---|---|
| Windows | `KOFstation\nucleos\` | zip + lançador 7 |
| Linux | `KOFstation/nucleos/` | tar + kofnes.sh 2 |
| Android (APK) | `assets/nucleos/` dentro do APK | `android/construir-apk.sh` |
| PWA (site) | `nucleos/` ao lado do index.html | `compilar.sh`; o `sw.js` guarda todos pra funcionar sem internet |
| Publicado | `publicado/nucleos/` | `publicar.sh` (só os do PC) |

## 7. O atualizador

### Windows: `KOFstation.exe` (`web/lancador_win.c`, em C, compilado com mingw)

Ao abrir:

1. baixa `publicado/versao.txt` do GitHub (`raw.githubusercontent.com`). Exemplo:
   ```
   versao=202610192355        ← versão do html (data e hora do build)
   tamanho=629933             ← tamanho do html (pra conferir o download)
   lancador=7                 ← versão do próprio exe
   tamanho_exe=95232
   lancador_linux=2
   tamanho_linux=8892
   nucleo=fceumm-9daaa24f.js:1558224     ← um por núcleo: arquivo:tamanho (sempre no fim)
   nucleo=gambatte-a540b1f5.js:870810
   nucleo=genplus-20e73ba1.js:3774674
   ```
2. **núcleos primeiro**: baixa pra `nucleos\` os que faltam ou estão com tamanho errado;
3. se a versão de lá é maior que a daqui e **todos** os núcleos vieram, baixa o html novo, confere tamanho e começo
   (`<!doctype html`) e troca. Se faltou algum núcleo, fica a versão daqui e tenta na próxima;
4. se `lancador=` de lá é maior, baixa o exe novo e troca (o Windows deixa renomear um exe em uso: o velho vira `.old`);
5. apaga de `nucleos\` o que não está mais na lista (só se o navegador ainda não abriu, pra não tirar um núcleo que a
   página aberta pode pedir);
6. abre o html no Edge em modo app (`--app=`), com perfil próprio em `%LOCALAPPDATA%\KOFnes`.

Tudo fica anotado em `atualizacao.log`. Rede ruim: espera até 15 s pra saber se tem versão nova e mais 60 s pra baixar;
passou disso, abre o jogo e termina por trás.

**Por que tão complicado pra baixar?** Na rede do Marcelo só 1 dos 4 IPs do GitHub respondia e o IPv6 não saía; o
WinHTTP e o WinINet tentam um IP de cada vez e travavam no primeiro morto (erro 12002). O lançador pergunta os IPs ao
DNS, conecta em todos ao mesmo tempo, fica com o primeiro que responder e baixa pelo `curl.exe` do Windows preso nesse
IP. WinINet e WinHTTP ficam de reserva.

**`fonte.txt`** (opcional, do lado do exe): troca de onde baixa. Um caminho do GitHub
(`/Marcelao98/KOFSnes/nucleos/publicado/`, pra testar uma branch) ou um endereço inteiro
(`http://127.0.0.1:8765/publicado/`, pra testar com um servidor local no Wine). `nao-atualizar` desliga tudo.

**Lançadores antigos** (5 e 6) não sabem de núcleo: baixam o html novo e o exe 7. Na abertura seguinte o 7 baixa os
núcleos. Nesse meio tempo, abrir um jogo de Game Boy mostra o aviso "faltou baixar".

### Linux: `kofnes.sh` (`web/lancador_linux.sh`, POSIX sh)

Mesmo fluxo com curl ou wget, procura um navegador Chromium (normal, Snap ou Flatpak). `KOFNES_URL` ou `fonte.txt`
trocam o endereço.

## 8. Vídeo, tempo e determinismo

- **Laço** (`laco()` no app.js): a cada `requestAnimationFrame` (normalmente 60 Hz do monitor) soma o tempo passado e
  roda quantos quadros do console couberem (`QUADRO_MS = 1000 / fps do núcleo`; Game Boy 59,73, NES 60,1). Até 4 por
  vez, pra não travar se a máquina engasgar.
- **Vídeo**: o quadro (RGBA) vira uma textura WebGL e é desenhado escalado, com filtros e molduras. Sem WebGL, canvas 2D.
- **Determinismo**: com a mesma ROM, o mesmo estado e os mesmos botões, o núcleo produz exatamente o mesmo resultado.
  É isso que faz funcionar o savestate (volta bit a bit), o rebobinar e o replay do caçador de bugs (um pacote de bug
  guarda o estado + os botões quadro a quadro e reproduz o erro em outra máquina, `bugs/reproduzir.cjs`).
- **Rebobinar**: a cada poucos quadros guarda uma foto do estado, mas só os pedaços de 16 KB que mudaram desde a
  anterior (o estado inteiro do Snes9x tem ~820 KB). Voltar = desfazer as diferenças.

## 9. Áudio e a sonda (jukebox / osciloscópio)

- **Som do jogo**: cada `runFrame` deixa as amostras do quadro numa fila; um `ScriptProcessor` do Web Audio toca a fila
  na taxa do núcleo (SNES 32 kHz, FCEUmm 48 kHz...), reamostrando pra taxa da placa de som.
- **Jukebox**: guarda o *estado* do jogo no momento em que a música toca (no SNES vira um arquivo .spc). Pra tocar,
  abre uma **segunda instância** do núcleo, sem imagem e sem botão, restaura o estado e deixa a música correr.
- **Sonda**: o modo Ondas mostra a forma de onda de cada canal do chip de som. O núcleo original só entrega o som já
  misturado, então cada núcleo ganhou um remendo (`nucleo-libretro/<núcleo>-sonda.patch`) que copia a saída de cada
  canal num buffer próprio (`kof_onda`) antes da mistura. A ponte lê esses buffers (`lr_onda`, `lr_onda_pos_c`).
  Canais: SNES 8 vozes (na `Dsp.kf`, em Kof), Game Boy 4, NES 5, Mega Drive 10 (6 FM + 4 PSG), SMS/GG 4.
- **Mudo/Solo** por canal: o remendo zera o canal escolhido (`lr_mudas`); no Genesis Plus GX usa as opções de volume
  por canal do próprio núcleo. Vale só na instância da jukebox.

## 10. Banco de dados e arquivos do usuário

Nada do usuário mora na pasta do programa (por isso atualizar não apaga nada). Fica no perfil do navegador:

- IndexedDB `kofnes` (versão 6): lojas `jogos` (biblioteca e prints), `roms`, `autos` (estado automático), `estados`
  (savestates em gzip), `capas`, `stats`, `musicas`. Mudou o formato: sobe a versão e migra no `onupgradeneeded`.
- `localStorage` com chaves `kofnes.*`: configurações (tema, volume, teclas, paletas...) e a bateria dos cartuchos.

## 11. Android

- **APK** (`android/construir-apk.sh`): uma Activity Java com uma WebView que mostra o `KOFnes-android.html`. Montado
  sem Gradle, com as ferramentas do Ubuntu (aapt, dx, apksigner). A página é servida em
  `https://appassets.androidplatform.net/` (endereço "seguro": IndexedDB, crypto e WebAssembly funcionam); o
  `MainActivity.servir()` entrega `index.html` e qualquer outro arquivo de `assets/` (como `nucleos/...`).
- A ponte `window.KOFnesApk` deixa o JavaScript salvar arquivos pelo "salvar como" do Android.
- O html do celular é o mesmo app com `android.js` (controle virtual multitoque, 6 modelos, barra de baixo) e
  `android.css`; `<html class="celular">` liga o modo celular.
- Assinatura com chave de TESTE pública (`android/kofnes-teste.keystore`). Play Store precisa de chave de verdade.

## 12. Build e publicação

```
nucleo-libretro/construir.sh      → nucleo-libretro/saida/<núcleo>.js   (emscripten; não vai pro git)
web/compilar.sh                   → dist/web/KOFnes.html, KOFnes-android.html, nucleos/, android/ (PWA),
                                    KOFstation.exe, kofnes.sh, versao.txt, dist/KOFstation-windows.zip / -linux.tar.gz
android/construir-apk.sh          → dist/KOFstation.apk
web/publicar.sh                   → compila e copia pra publicado/ (o atualizador lê de lá na main)
```

`publicado/` tem os dois nomes (`KOFstation.*` e `KOFnes.*`) porque lançadores antigos e o kofnes.sh ainda baixam o
nome velho.

## 13. Testes

- `testes/node/`: núcleo Kof sem navegador (savestate, rebobinar, replay, contraste dos temas).
- `testes/libretro/`: ponte e adaptador no Node, Game Boy e jukebox no navegador.
- `testes/navegador/`: Playwright + Chromium abrindo o html de verdade (menus, temas, estados, núcleos sob demanda...).
- `testes/android/`: celular com toque e o APK simulado (a página no endereço do app, a ponte trocada por um falso).
- Lançadores: Wine com `fonte.txt` apontando pra um servidor local (`python3 -m http.server`) com um `publicado/` falso.
- ROMs só livres ou geradas (dmg-acid2, nes-test-roms, PeterLemon/SNES, ROMs de Mega Drive escritas à mão).

## 14. O que vem depois

- **GBA** (mGBA) e **Neo Geo** (FBNeo): entram como mais um núcleo em `nucleos/`, uma entrada em `SISTEMAS` e um
  remendo de sonda. O Neo Geo precisa de tela pra BIOS e de um "disco virtual" (MEMFS do emscripten) pro zip inteiro.
- **Kof aos poucos**: reescrever cada console em Kof usando o núcleo libretro como gabarito (rodar os dois lado a lado e
  comparar quadro a quadro, graças ao determinismo).
- Limites: WebAssembly aguenta até GBA/Neo Geo com folga; PS1 no limite do celular; N64/Saturn pra cima precisariam de
  núcleo nativo (DLL no PC, nativo no APK) com a mesma interface.

## Glossário

- **BIOS**: programa interno do console (Neo Geo, GBA). Não é livre; o usuário traz o dele.
- **Callback**: função que você entrega pra outra chamar depois (o núcleo chama a nossa pra entregar vídeo e som).
- **CRC32**: número de 32 bits calculado dos bytes de um arquivo; serve de "impressão digital" curta.
- **Determinístico**: mesma entrada, mesma saída, sempre.
- **emscripten**: compilador de C/C++ para WebAssembly.
- **Frontend**: o programa que usa um núcleo libretro (aqui, a ponte + o app).
- **Hash (SHA-256)**: impressão digital de um arquivo; qualquer mudança no conteúdo muda o hash.
- **IndexedDB**: banco de dados do navegador, onde ficam saves e biblioteca.
- **libretro**: interface padrão entre núcleos de emulador e programas que os usam.
- **MEMFS**: sistema de arquivos de mentira, na memória, que o emscripten oferece pro código C.
- **Núcleo**: o emulador propriamente dito (CPU, vídeo, som do console), sem interface.
- **PWA**: site que o celular instala como app e abre sem internet (o `sw.js` guarda os arquivos).
- **Quadro (frame)**: uma imagem da tela; o console desenha ~60 por segundo.
- **Savestate**: foto do estado inteiro do console, pra voltar exatamente àquele momento.
- **Service worker (`sw.js`)**: script do navegador que intercepta downloads do site e responde do cache.
- **Sonda**: o nosso remendo que copia o som de cada canal antes da mistura (osciloscópio).
- **SRAM / bateria**: memória do cartucho onde o jogo grava o progresso.
- **WebAssembly (wasm)**: código de máquina portátil que o navegador executa rápido.
- **WebGL**: desenho acelerado pela placa de vídeo no navegador.
- **WebView**: o navegador embutido num app Android.
