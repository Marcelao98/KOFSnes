# KOFnes — contexto pra próxima sessão

Emulador de Super Nintendo escrito em **Kof** (linguagem brasileira, github.com/KofLang/Kof4j,
criada pela Mel Santos ~2 meses antes do projeto). Dono: Marcelo (Marcelao98). Repositório:
**Marcelao98/KOFSnes**, branch `main`. A história completa, pra humano, está em `HISTORICO.md`;
o que o produto faz está no `README.md`.

## Como falar com o Marcelo

- Português do Brasil, informal, direto. Ele escreve rápido por voz (muitos erros de digitação:
  "Redmi" = README, "kofnes"/"Coffes Ness" = KOFnes).
- Ele se preocupa com **economia de tokens**: fazer só o que ele pediu, sem varrer coisas à toa
  (ex.: quando pediu "teste só esse jogo", não rodar 300 ROMs).
- Funcionalidade nova grande: **branch novo**, testar, mandar o zip; depois ele pede pra juntar na
  `main` e **publicar pelo atualizador**. Correção/pedido pequeno: direto na `main` + publicar.
- Ele testa no Windows de verdade (KOFnes.exe) e manda prints/gravações com bugs. Ele é quem
  joga; os amigos e a galera do LinkedIn também já usam.

## Regras que não mudam

- **Nunca** commitar, distribuir ou indicar onde baixar ROM (nem em teste, doc ou issue).
- **KOFnes não vai pro repositório natty-bot** (já aconteceu por engano e ele não gostou).
- Commits: mensagem em português, **sem nome de modelo de IA**, terminando com as linhas de
  co-autoria/sessão que o sistema indicar. `git status` antes de commitar.
- Não abrir PR sem ele pedir.

## Estrutura

```
snes/            núcleo em Kof (~5.600 linhas): Cpu.kf (65816), Ppu.kf, Spc.kf (SPC700),
                 Dsp.kf, Apu.kf, CpuBus.kf/Snes.kf (barramento, DMA/HDMA, IRQ), Cartridge.kf
                 (LoROM/HiROM/ExHiROM, SRAM), Gsu.kf (Super FX)
web/             A VERSÃO PRINCIPAL: o núcleo Kof → JavaScript num KOFnes.html só
  app.js         toda a interface (≈1.800 linhas): biblioteca, Início, temas, savestates,
                 rebobinar, jukebox, estatísticas, caçador de bugs, atualizações...
  estado.js      savestate genérico (KofEstado.capturar/restaurar) + Rebobinador (fotos delta)
  spc.js         ler/gravar arquivos .spc (jukebox)
  pagina.html, estilo.css (126 temas por variáveis CSS), juntar.py (monta o HTML)
  compilar.sh    build: kof build --target js → juntar.py → dist/web/KOFnes.html + KOFnes.exe
                 (mingw) + versao.txt + dist/KOFnes-windows.zip
  publicar.sh    compila e copia html/exe/versao.txt pra publicado/ (o atualizador lê de lá)
  lancador_win.c o KOFnes.exe: atualizador (IP que responde + curl.exe; WinINet/WinHTTP de reserva) + abre o html numa janela app do Edge
  kof-js-correcoes.patch  correções no alvo JS do compilador Kof (sem elas o núcleo quebra)
publicado/       a versão que o KOFnes.exe dos usuários baixa (raw.githubusercontent.com)
bugs/reproduzir.cjs  roda um pacote do caçador de bugs (kofbug-*.json.gz) quadro a quadro
testes/          scripts de teste (Playwright e Node), ver testes/README.md
docs/            como-o-snes-funciona.md, relatórios dos bugs do Kof, kof-repros/, issues/, prints/
app/, empacotar/, nativo/  versões antigas: Java (instalador) e nativa Linux só em Kof
                 (~22 fps) — hoje são laboratório da linguagem, não recebem funcionalidades
```

## Montar o ambiente (o container da nuvem perde tudo fora do repositório)

1. Compilador Kof 0.6.3 **com o patch**: clonar github.com/KofLang/Kof4j, `git checkout
   kof-0.6.3-linux-x86_64`, aplicar `web/kof-js-correcoes.patch` (mexe em 5 arquivos de
   `kof-compiler/src/main/java/dev/kof/compiler/js/`), recompilar e atualizar o `lib/kof.jar`
   (na sessão anterior: compilar as classes alteradas com javac e trocar dentro do jar com
   `jar uf`; Maven com JAVA_HOME num JDK 25 também serve). Depois:
   `export PATH=<Kof4j>/bin:/usr/lib/jvm/java-25-openjdk-amd64/bin:$PATH`.
2. `web/compilar.sh` precisa de python3 (PIL só pros prints) e `x86_64-w64-mingw32-gcc` pro .exe.
3. Testes: Playwright/Chromium já vêm no container (`/opt/node22/...`, `/opt/pw-browsers`);
   WebGL headless com `--use-gl=swiftshader --enable-unsafe-swiftshader`. O `.exe` dá pra testar
   com Wine (`/usr/lib/wine/wine64`, WINEPREFIX numa pasta temporária).
4. ROMs livres pra teste: github.com/PeterLemon/SNES (CPU, PPU/Mode7, SPC700/FFVIIPrelude
   tem música). Nunca subir ROM pro git.

## Como as coisas funcionam (o que costuma importar)

- O núcleo é **determinístico**: savestate restaura bit a bit; o rebobinar e o replay do caçador
  de bugs dependem disso (teste: `testes/node/rebob.cjs`, `replay.cjs`).
- Banco do navegador: IndexedDB `kofnes` versão 6 — lojas c, jogos (metadados e prints), roms,
  autos (estado automático), estados (savestates gzip), capas, stats, musicas. Mudou o formato?
  subir a versão e migrar no `onupgradeneeded` (já tem migração v4→v5).
- Telas: `#home`, `#biblioteca`, `#estados`, `#jukebox`, `#estatisticas`, `#guia`, `#teclas`;
  o jogo pausa com qualquer uma aberta; histórico do Voltar por MutationObserver nelas.
- Biblioteca com milhares de ROMs: lista em lotes de 150, pasta lida 1x por sessão em segundo plano.
- Atualizador: `publicado/versao.txt` tem `versao=AAAAMMDDHHMM`, `tamanho=`, `lancador=`,
  `tamanho_exe=`. O exe compara com o `versao.txt` local, baixa, confere tamanho/cabeçalho,
  troca, e anota tudo em `atualizacao.log` ao lado do exe. `LANCADOR` no `lancador_win.c`
  (hoje 5) controla a troca do próprio exe; `lancador_linux=` e `tamanho_linux=` fazem o mesmo pro kofnes.sh.

## Pendências (atualizado 17/10)

- ~~Atualizador no Windows~~ **Resolvido.** Lançador 2 (WinHTTP, log, troca do próprio exe) publicado
  na versão 202610171459; troca do exe confirmada no Wine e o Marcelo já testou no Windows dele e em
  outro computador (só exe + html + jogos): roda liso. Se falhar de novo, pedir o `atualizacao.log`.
- **Decidido, a fazer depois (branch novo): envio de bug/sugestão com um clique.** Cloudflare Worker
  (token fine-grained só de issues, guardado no Worker) cria a issue num repositório **privado**
  "caixa" do Marcelo (ex.: `kofnes-caixa`); anônimo, só `{tipo, texto, versão}`; limite de tamanho e
  de pedidos + honeypot. Sem internet/falha: cai no fluxo atual (issue preenchida no GitHub). Envio
  automático é só texto; o pacote do caçador de bugs continua baixado à parte (conferir antes se ele
  carrega trechos de ROM). Caixa de sugestões na mesma tela. A conta Cloudflare/token é do Marcelo.
- **Publicado (17/10):** navegação corrigida (botão direito nas telas = Voltar; Esc = volta ao jogo;
  Voltar anda pelo histórico; F2 só no jogo), correção do foco (tirar print não pula pro jogo), menu
  Arquivo por cima da barra lateral e **lançador de Linux** (`web/lancador_linux.sh` → `kofnes.sh`, POSIX
  sh, qualquer distro).
- **Atualizador no Windows do Marcelo (branch `atualizador-wininet`, ainda não publicado):** o erro 12002
  era a rede dele: só 1 dos 4 IPs do raw.githubusercontent.com responde (185.199.110.133) e o IPv6 não
  sai. O **lançador 5** pede os IPv4 ao DNS, conecta em todos ao mesmo tempo e baixa pelo `curl.exe` do
  Windows preso no IP que respondeu (`--resolve`); WinINet e WinHTTP ficam de reserva com prazo de 3 s.
  Testado no Windows dele: atualiza em ~1 s. O lançador 4 (só WinINet) está publicado e não resolve.
- **Perfil (`.kofperfil`) está só no branch `ccr-ff223c92-a1bil9`, FORA da main por pedido dele:** foi
  publicado na 202610172119 e retirado com `git revert` (commit "Revert Perfil...") + nova publicação.
  Pra trazer de volta: `git revert` desse revert na main (ou juntar o branch). Formato: `KOFPERFIL1` +
  tamanho do cabeçalho + JSON + blocos binários. O "quebrou tudo (jukebox etc.)" era o **mudo**: carregar
  o perfil copia todas as configs `kofnes.*`, inclusive `mudo=1`. Ao trazer de volta, não levar `mudo`
  nem `volume` no arquivo. ~100 MB a otimizar. O "Continuar sem ROM pede a pasta" (`c1260eb`) também
  ficou só nesse branch, porque só serve pro perfil.
- **Aviso de mudo (branch `atualizador-wininet`):** "o som está desligado: aperte M pra ligar" ao abrir
  um jogo e no play da jukebox.
- **Rebobinar estilo Príncipe da Pérsia (trazido do branch do perfil pro `atualizador-wininet`, ainda não
  publicado):** segurar Backspace/Select+Y volta até 5 s em preto e branco; soltou ou acabou, o buffer
  zera e a ampulheta ⏳ leva 30 s de jogo pra recarregar. Sem item no menu (savestates guardam momentos);
  só roda com o jogo andando. Chave `kofnes.rebobLimite` (3/5/10/15) só pros testes. Teste:
  `testes/navegador/rebob.cjs`.
- **Temas com categorias e busca (branch `temas-menu`, ainda não publicado):** a galeria tem busca (sem acento,
  por nome/categoria/id) e fileira de categorias (os grupos de `TEMAS` em `web/app.js`; grupo novo vira categoria
  sozinho), o showcase passa só os temas filtrados, e o **menu do botão direito** (menu rápido) ganhou o item
  "🎨 Tema" (◀▶ troca, Enter abre a galeria). Pra adicionar tema: bloco `[data-tema="id"]` no `estilo.css` + uma
  linha em `TEMAS`; o contador "N temas" do Início e do Guia se atualiza sozinho. Teste: `testes/navegador/temas-menu.cjs`.
- **Pacote Café (branch `temas-menu`, não publicado):** categoria "Café" com 8 temas: `cafe` (Café queimado, o
  original e o padrão, **não mexer**), `espresso`, `cappuccino`, `latte`, `mocha`, `caramelo`, `coldbrew`, `canela`.
  Tokens do sistema: `--fundo`, `--painel`/`--painel2`, `--texto`, `--fraco`, `--destaque`, `--borda`, `--sel` e (novos,
  opcionais) `--botao-fundo`/`--botao-texto` pro `.grande`. Foco de teclado e `:disabled` agora valem pra todos os temas.
  Testes: `testes/node/contraste.cjs` (WCAG dos 8) e `testes/navegador/pacote-cafe.cjs`.
- **Pacotes de temas (branch `temas-menu`, não publicado):** 126 temas: Café 8, Animais 7, Animes 23 (a categoria 'Anime' virou 'Animes'), Bem brasileiro 44 (os antigos 3 + Nostalgia BR 20 + Brasilidades 20 + Clube da Esquina), Clássicos do SNES 26 (20 jogos + os 6 de 'Jogos'); as categorias Nostalgia BR, Brasilidades e Jogos foram mescladas a pedido dele. IDs de tema não podem ter hífen (viram chave de objeto no app.js). Showcase tem dois botões: lento (3,5 s por tema) e rápido (0,5 s, pra apresentar pros outros). `TEMAS` aceita descrição
  opcional (`[id, nome, descrição]`, aparece na prévia e entra na busca); Nostalgia BR tem 20 com descrição. Só cor, gradiente e
  textura leve em `--fundo-img` (sem imagem, sem nome de marca). Testes: `testes/node/contraste.cjs` (lista de ids no topo; todo
  tema novo entra lá) e `testes/navegador/nostalgia-br.cjs` e `categorias-temas.cjs` (contagens, nomes, ids únicos, persistência, prints).
- **Android (branch `android`, não publicado):** `web/compilar.sh` gera `dist/web/KOFnes-android.html` (e a pasta `dist/web/android/`
  = PWA: index.html + manifest + sw.js + ícones) quando existe `nucleo-libretro/saida/snes9x.js` (construir com
  `nucleo-libretro/construir.sh snes9x`, emscripten + libretro/snes9x; licença só NÃO comercial). Núcleo no celular = **Snes9x em WebAssembly**
  (`web/nucleo.js` imita o núcleo Kof: pad, runFrame, ppu.frame, apu.dsp, cart.sram; savestate e rebobinar via
  retro_serialize, ~820 KB por estado); o PC continua com o núcleo Kof. `juntar.py <...> <pasta-com-snes9x.js>` monta o modo celular:
  `web/android.js` entra DENTRO da função do app.js (mesmo escopo), `web/android.css` junto do CSS, `<html class="celular">`.
  Controle virtual (multitoque, deslizar entre botões) com 6 modelos (classico, moderno, minimo, arcade, portatil, tema), tela
  Controles (reaproveita a janela de teclas), barra de baixo no lugar do menu/lateral, voltar do Android = menu rápido, textos de PC
  escondidos com `.so-pc` / `.so-cel` (no pagina.html) e `CELULAR` no app.js. Testes: `testes/libretro/nucleo.cjs` (Node) e
  `testes/android/celular.cjs` (Playwright com toque; aceita html, rom, pasta de prints). Pendente: testar no aparelho real
  (latência, desempenho do Snes9x), APK (Capacitor/GitHub Actions), seletor de pasta de ROMs (só no APK), guardar música e caçador
  de bugs não existem no celular, posições do arcade/portátil na horizontal usam o layout padrão.
- **APK (branch `android`):** `android/construir-apk.sh` (depois de `web/compilar.sh`) gera `dist/KOFnes.apk` SEM Gradle e sem
  SDK completo: WebView nativa em Java (`android/src`, uma Activity) com o `KOFnes-android.html` dentro (assets/index.html),
  servido em `https://appassets.androidplatform.net/` (endereço seguro: IndexedDB, crypto, WebAssembly). Ferramentas do Ubuntu:
  `apt install aapt apksigner zipalign libandroid-23-java dalvik-exchange android-sdk-platform-23` + JDK; compila com
  `javac --release 8` contra o android.jar API 23, sem lambdas (o dx não desaçucara). minSdk 24, targetSdk 34, assinado v2/v3 com
  a chave de TESTE `android/kofnes-teste.keystore` (senha `kofnes-teste`; é pública de propósito: serve pra instalar e atualizar
  por cima; **Play Store precisa de chave de verdade fora do repositório e de AAB**). A ponte `window.KOFnesApk` (MainActivity.Ponte)
  salva arquivos (pacote de bug, .spc exportado) pelo "salvar como" do Android; o seletor de arquivo (ROM, .spc) e o window.open
  (issue do GitHub, abre no navegador) são tratados na Activity. Teste sem celular: `testes/android/apk-simulado.cjs` (serve o
  html no endereço do app e troca a ponte por um stub). O APK de teste fica em `android/apk/KOFnes.apk` (link direto pelo raw.githubusercontent.com na branch `android`; o celular dele não abre zip). Menu rápido no celular: ☰, ou toque longo SÓ em cima da imagem do jogo (`contextmenu` fora de `#tela`/`#moldura` é ignorado). O controle (6 modelos) é desenhado em CSS (`web/android.css`: relevo com radial-gradient/color-mix, setas do direcional com clip-path); no retrato as medidas usam a largura (`--u: 0.87cqw`), na horizontal a altura. Ainda NÃO testado num aparelho de verdade. Faltam: escolher a pasta de
  ROMs inteira (SAF, ACTION_OPEN_DOCUMENT_TREE) e AAB/assinatura de produção pra Play.
- **Multi-sistema (branch `multi-sistema`, a partir da `android`, não publicado):** núcleos libretro em WebAssembly, sem
  reescrever núcleo em Kof. Etapa 1 feita: `nucleo-libretro/ponte.cpp` (ponte genérica, funções `lr_*`; `lr_info()` dá
  tamanho/proporção/fps/taxa de áudio do `retro_get_system_av_info`) + `nucleo-libretro/construir.sh snes9x|gambatte` →
  `saida/<núcleo>.js` (módulo `Nucleo_<núcleo>`). Teste: `node testes/libretro/ponte.cjs gambatte rom.gb`. ROMs livres de GB:
  dmg-acid2/cgb-acid2 (github.com/mattcurrie). Etapa 2 feita: `web/nucleo.js` (`KofLibretro`, substituiu o nucleo_s9x.js):
  `SISTEMAS` (snes: .sfc/.smc/.fig/.swc → snes9x 256x224; gb: .gb/.gbc/.sgb → gambatte 160x144), `criar(bytes, nomeDoArquivo)`,
  `sistemaDe(nome)`, `disponivel(sis)`; o objeto tem `sistema`, `nucleo`, `largura/altura`, `fps`, `taxaAudio`, `rgba` (já no
  formato do canvas) e `ppu.frame` (getter no formato Kof). Estado: `{lr: núcleo, d}` (Snes9x mantém `s9x: 1`). O juntar.py
  embute todo `nucleo-libretro/saida/*.js`. Pacote de bug: `nucleo` = 'kof' | 's9x' | 'gambatte'. Teste:
  `node testes/libretro/nucleo.cjs rom.sfc|rom.gb`. Próximas: tirar 256x224/32 kHz/60,1 fps fixos do app.js, Game Boy no
  app (A/B/Start/Select, extensões, biblioteca), APK com os dois núcleos, PC com Gambatte em WebAssembly.
- README: não existe *release* no GitHub (o README aponta pra `publicado/`); sugerido criar uma
  com o zip. O print do modo sofá no README mostra capas comerciais e nomes de teste repetidos.
- Bugs conhecidos de compatibilidade: defeito gráfico na parte de baixo da tela no **Mega Man X**;
  **Super Mario All-Stars + World** trava na mensagem do começo (o SMW avulso roda bem).
- Ideias que ele curtiu e ainda não foram feitas: Android (GitHub Pages/PWA + controle touch),
  lançador de Linux igual ao do Windows, exportar estatísticas (CSV) / "Seu ano retrô", patches
  IPS/BPS (traduções), triagem automática Java × JavaScript dos pacotes de bug (achar bugs do
  Kof pra Mel), conquistas (RetroAchievements), jogar online, kit de lançamento (licença,
  modelos de issue, notas de versão, site), KOFnes multi-sistema (NES/Game Boy; núcleos pesados
  como PS1 talvez em Rust → WebAssembly, ideia dele, falar com a Mel).
