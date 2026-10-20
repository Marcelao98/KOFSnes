# Testes do KOFnes

Scripts usados durante o desenvolvimento pra conferir cada funcionalidade. Nenhum
deles vem com ROM: passe as suas (ou ROMs livres, como os testes do PeterLemon,
github.com/PeterLemon/SNES) pela linha de comando.

## navegador/ (Playwright + Chromium)

Abrem o `dist/web/KOFnes.html` num Chromium sem janela e usam a interface de
verdade. O `require` aponta pro Playwright do container da nuvem
(`/opt/node22/lib/node_modules/playwright`, Chromium em `/opt/pw-browsers`);
fora dele, troque pelo seu.

```
web/compilar.sh
H=dist/web/KOFnes.html
node testes/navegador/teste.cjs   $H rom.zip saida/      # abre, joga, troca temas
node testes/navegador/estados.cjs $H rom1 rom2 saida/   # biblioteca + savestates
node testes/navegador/rapido.cjs  $H rom saida/         # menu rápido, volume, 4:3, tela cheia
node testes/navegador/rebob.cjs   $H rom saida/         # rebobinar + molduras
node testes/navegador/juke.cjs    $H rom-com-musica arquivo.spc saida/
node testes/navegador/home.cjs    $H rom saida/         # Início, Voltar, menu lateral, guia
node testes/navegador/bib.cjs     $H x saida/           # biblioteca com 3.000 jogos de mentira
node testes/navegador/nucleos.cjs dist/web rom.gb rom.nes rom.md rom.sfc [rom.gba]   # núcleos em nucleos/, só sob demanda (PC e celular)
node testes/navegador/gba.cjs     dist/web rom.gba saida/   # GBA: tela 240x160, L/R no celular, BIOS, save enxuto
node testes/navegador/abertura.cjs  dist/web rom.gb saida/   # abertura da primeira vez + guia + música (Air e Se Essa Rua)
node testes/navegador/capas-wav.cjs dist/web som.gba neogeo.zip mslug.zip   # capas de GBA e Neo Geo + exportar .wav
node testes/navegador/neogeo.cjs  dist/web neogeo.zip mslug.zip 2020bb.zip 2020bba-split.zip saida/   # Neo Geo com zips FALSOS (testes/neogeo/zip-falso.py)
```

Os outros: `auto` (salvar automático), `sofa`, `teclas`, `bug` (caçador de bugs),
`direito` (botão direito), `galeria` e `temas` (temas), `migra` (banco antigo →
novo), `atualiza` (avisos do atualizador), `hometemas` (Início em vários temas),
`filtros`, `dk`, `erro`. Cada um imprime um JSON com os resultados e `"erros": []`
quando a página não deu erro.

## node/ (sem navegador)

Carregam o núcleo de dentro do KOFnes.html (módulo `vm`) e testam a parte
determinística:

- `rebob.cjs html rom`: rebobinar volta bit a bit (os quadros seguintes têm que sair iguais)
- `replay.cjs html pacote.json.gz rom`: roda um pacote do caçador de bugs
- `hirom.cjs html`: SRAM de cartucho HiROM (o bug do Donkey Kong Country)
- `juke.cjs html rom` e `tocaspc.cjs html arquivo.spc`: jukebox e arquivos .spc
- `custo.cjs`, `medir.cjs`, `peso.cjs`: quanto custa e quanto pesa o savestate
