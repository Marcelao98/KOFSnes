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
web/             A VERSÃO PRINCIPAL ("sem Java"): o núcleo Kof → JavaScript num KOFnes.html só
  app.js         toda a interface (≈1.800 linhas): biblioteca, Início, temas, savestates,
                 rebobinar, jukebox, estatísticas, caçador de bugs, atualizações...
  estado.js      savestate genérico (KofEstado.capturar/restaurar) + Rebobinador (fotos delta)
  spc.js         ler/gravar arquivos .spc (jukebox)
  pagina.html, estilo.css (28 temas por variáveis CSS), juntar.py (monta o HTML)
  compilar.sh    build: kof build --target js → juntar.py → dist/web/KOFnes.html + KOFnes.exe
                 (mingw) + versao.txt + dist/KOFnes-sem-java-windows.zip
  publicar.sh    compila e copia html/exe/versao.txt pra publicado/ (o atualizador lê de lá)
  lancador_win.c o KOFnes.exe: atualizador (WinHTTP) + abre o html numa janela app do Edge
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
  (hoje 2) controla a troca do próprio exe.

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
- **Navegação corrigida (falta publicar pelo atualizador):** botão direito nas telas = Voltar (no jogo,
  menu rápido); Esc fecha a tela e volta ao jogo (sem jogo, Início); Voltar/Alt+←/botão 4 andam pelo
  histórico de telas e só chegam ao jogo quando não sobra tela; F2/Select+Start só durante o jogo;
  Alt+← funciona na Biblioteca. Conferido com `testes/navegador/matriz.cjs`.
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
