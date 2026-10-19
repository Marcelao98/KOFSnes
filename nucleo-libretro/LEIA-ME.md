# Núcleos libretro em WebAssembly

O KOFstation não reescreve núcleo: usa núcleos que já existem no padrão **libretro**, compilados pra
WebAssembly com o emscripten e ligados por uma ponte pequena (`ponte.cpp`) que faz o papel de
"frontend" do libretro e expõe funções simples (`lr_load`, `lr_run`, `lr_info`, ...) pro JavaScript.

- `construir.sh snes9x|gambatte` baixa o núcleo (commit fixo), compila e gera `saida/<núcleo>.js`
  (um arquivo só, com o .wasm embutido; não vai pro git). Sem argumento, compila os dois.
- A ponte é a mesma pra todos: tamanho da tela, proporção, fps e taxa de áudio vêm de
  `retro_get_system_av_info` (`lr_info()` devolve 7 números: largura/altura base, largura/altura máxima,
  proporção, fps, taxa de áudio). Imagem sai em RGBA (formato do canvas), qualquer que seja o formato do núcleo.
- Teste rápido (Node): `node testes/libretro/ponte.cjs gambatte rom.gb` (ROM de teste LIVRE, ex.: dmg-acid2).

| Núcleo   | Sistema          | Licença                                  | Fonte |
|----------|------------------|------------------------------------------|-------|
| Snes9x   | Super Nintendo   | própria, só uso NÃO comercial (`LICENCA-SNES9X.txt`) | github.com/libretro/snes9x |
| Gambatte | Game Boy / Color | GPL-2.0 (código-fonte no link, commit em `construir.sh`) | github.com/libretro/gambatte-libretro |

O KOFstation é gratuito, sem anúncio e sem doação; manter os avisos de copyright dentro do app.
O usuário traz a ROM (e a BIOS, se o sistema precisar); o KOFstation nunca distribui nenhuma das duas.
