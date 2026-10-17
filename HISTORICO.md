# ☕ KOFnes — histórico do projeto

*De "será que dá pra fazer um Super Nintendo em Kof?" a um emulador que os amigos já usam. Tudo isso em 13 a 17 de outubro de 2026.*

---

## Dia 1 (13/10): nasce um Super Nintendo em Kof

**O começo.** A ideia era testar o Kof, a linguagem que a Mel criou há uns dois meses, com o projeto mais exigente possível: um emulador de Super Nintendo. Entraram o processador (65816), o vídeo (PPU), o chip de som (SPC700 + DSP), o cartucho e até o **Super FX**, o chip extra de Star Fox e Yoshi's Island. Tudo com o visual "café" desde o primeiro dia.

**Primeiro jogo comercial.** O **Mega Man X rodou liso a 61 fps** no Windows. Foi o momento em que deu pra ver que aquilo funcionava de verdade.

**Ajudando a linguagem.** Construir o emulador encontrou bugs no próprio Kof. Eles viraram:
- relatórios para a Mel, em versão para pessoas e versão para IA;
- 19 reproduções mínimas;
- issues prontas, com links que já abrem o formulário preenchido no GitHub do Kof.

**A briga com o tamanho.** A primeira versão para baixar vinha com Java embutido e era pesada. Ela foi enxugada até um instalador de 12 MB (15 MB instalado). Saiu também uma versão nativa só em Kof, de 0,3 MB, mas lenta: uns 22 fps.

**A virada: a versão sem Java.** O núcleo em Kof passou a ser traduzido para JavaScript e virou **um único KOFnes.html de ~100 KB**, aberto por um KOFnes.exe numa janela própria do Edge. Rápido, leve e com 4 temas. É essa versão que o projeto usa até hoje.

*(Um tropeço no caminho: no começo o KOFnes foi parar dentro do repositório errado, o da Natty. Foi tirado de lá e ganhou casa própria, o KOFSnes.)*

**Fim do dia:** configuração de teclas, o primeiro pedido de "emulador de verdade tem que deixar configurar".

---

## Dia 2 (14/10): de emulador a produto

Foi o dia mais intenso, guiado pelos testes de quem jogava.

**🗂️ Jogar com conforto**
- Biblioteca estilo ZSNES, com as **capas oficiais** dos jogos.
- **Savestates por jogo, com o print do momento**, e "continuar de onde parou".
- O **modo sofá**, uma grade de capas para jogar de longe com o controle.
- **7 filtros de imagem**, incluindo a TV de tubo (CRT).
- **Tela cheia de verdade**, proporção 4:3 "como na TV", volume e o **menu rápido** no meio do jogo (Select+Start, depois também o botão direito do mouse).

**🎨 A cara do KOFnes**
- **28 temas**: de Windows 98 a Orkut, de anime a "Console de camelô", com uma galeria que mostra cada tema ao vivo.
- **Estatísticas**: quanto tempo você jogou e o quê.
- **Molduras**: TV de madeira dos anos 80, TV de tubo dos anos 90 e fliperama.

**⏪ As funções "nunca vi isso"**
- **Rebobinar o tempo**: segura o Backspace e o jogo volta. Pausado, dá pra voltar até o momento exato e salvar ali.
- **Jukebox**: guarda a música que está tocando no jogo e toca depois, sozinha. Abre arquivos .spc e deixa silenciar cada uma das 8 vozes do chip de som.

**🐞 Os bugs e o caçador de bugs**
- **"Donkey Kong é impossível"**: o DKC caía na tela antipirataria. A culpa era do emulador, que não tinha a memória de save dos cartuchos HiROM. Corrigido, e de quebra voltou o save de Chrono Trigger e DKC 2 e 3.
- **Caçador de bugs**: F9, ou sozinho quando o emulador quebra, abre a issue no GitHub já preenchida e baixa um pacote que reproduz o bug quadro a quadro.
- **A biblioteca travando** com uma pasta de milhares de ROMs, e os "jogos invisíveis" no modo sofá. Esses vieram de um teste gravado em vídeo. Resolvido: a lista carrega aos poucos, a pasta é lida por trás, a busca aceita as palavras em qualquer ordem e tem o botão "Só os principais", que esconde hacks e cópias ruins.

**🔄 Sem baixar de novo:** o KOFnes.exe passou a **se atualizar sozinho pelo GitHub**.

**🏠 Tela de Início.** Uma primeira tela no clima do tema escolhido (até a frase de boas-vindas muda), com continuar, jogados recentemente e dica do dia. Vieram junto o **menu lateral**, o botão **Voltar** e o **Guia do KOFnes** dentro do emulador.

**📖 Para estudar:** um texto de ~10 páginas sobre **como o Super Nintendo funciona por dentro**.

---

## Dias 3 a 5 (até 17/10): ajustes finos

- **Atualizador mais firme.** Na primeira vez real ele não atualizou: a conexão demorou mais do que ele esperava. Foi reescrito com mais paciência, com um registro do que aconteceu e com a capacidade de atualizar o próprio .exe.
- **README novo**, com prints.

---

## Em números

- **~5.600 linhas de Kof** no núcleo, e o emulador inteiro cabe num arquivo de ~500 KB.
- **36 atualizações** principais (sem contar as publicações do atualizador) em 5 dias.
- **19 bugs** da linguagem Kof encontrados e documentados para a Mel.
- Já usado por amigos e pela galera do LinkedIn.

## O que vem pela frente

- Celular: o mesmo KOFnes no Android, com controle na tela.
- Linux com o mesmo lançador do Windows.
- Mais consoles: NES, Game Boy, Mega Drive, e quem sabe PlayStation com Rust.
- Conquistas, jogar online com um amigo e traduções (patches IPS/BPS).
