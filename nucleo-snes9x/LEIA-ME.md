# Núcleo Snes9x pro celular (teste)

O núcleo do KOFnes (em Kof) roda 100% no PC, mas num celular fraco não dá conta. Aqui o **Snes9x**
(libretro, C++) é compilado pra WebAssembly e ligado por uma ponte pequena (`ponte.cpp`) que faz o papel de
"frontend" do libretro e expõe funções simples (`s9x_load`, `s9x_run`, ...) pro JavaScript.

- `construir.sh` baixa o Snes9x (commit fixo), compila e gera `saida/snes9x.js` (não vai pro git).
- `web/compilar.sh` embute esse arquivo no `dist/web/KOFnes-bench.html` (só no arquivo de teste).
- **Licença:** o Snes9x só pode ser usado/distribuído para fins **não comerciais** (veja `LICENCA-SNES9X.txt`).
  O KOFnes é gratuito, sem anúncio e sem doação; manter o aviso de copyright dentro do app.
