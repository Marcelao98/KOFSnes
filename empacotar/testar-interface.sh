#!/usr/bin/env bash
# Teste de interface dos pacotes: faz o que um usuário faz e confere a tela.
#   1. abre o programa sem ROM
#   2. clica em Arquivo > Abrir ROM... e confere que o diálogo apareceu
#   3. escolhe a ROM no diálogo e confere que o jogo começou a desenhar
#   4. espera o título, aperta Enter (Start) e confere que a tela mudou
#   5. pausa, reinicia, turbo, Tela > Escala 2x (a janela tem que mudar de
#      tamanho), Ajuda > Controles e Arquivo > Sair (o programa tem que fechar)
#   6. confere que nenhuma exceção foi parar no log: com o Java podado, uma
#      classe que faltar aparece aqui como NoClassDefFoundError
#
# Uso: testar-interface.sh linux|windows|instalador <rom.sfc|rom.zip>
#   instalador: instala o KOFnes-instalador-windows.exe em silêncio no Wine
#   e testa o que ele instalou
# Precisa: Xvfb, xdotool, python3 + Pillow; pra "windows", wine64.
# A ROM de referência usada até aqui é o Monster Farm Jump (PeterLemon/SNES):
# título por volta de 14 s, Start leva à seleção de fase.
set -uo pipefail
ALVO="$1"
ROM="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
AQUI="$(cd "$(dirname "$0")" && pwd)"
DIST="$(dirname "$AQUI")/dist"
TMP="$(mktemp -d)"
TELA=":97"
export DISPLAY="$TELA"
FALHAS=0
WINE="${WINE:-$(command -v wine64 || echo /usr/lib/wine/wine64)}"
WINESERVER="${WINESERVER:-$(command -v wineserver || echo /usr/lib/wine/wineserver)}"
APP=""

ok()    { echo "  ok    $1"; }
falha() { echo "  FALHA $1"; FALHAS=$((FALHAS + 1)); }
foto()  { python3 -c "from PIL import ImageGrab; ImageGrab.grab(xdisplay='$TELA').save('$1')"; }
# fração de pixels diferentes entre duas fotos, na área da tela do jogo
dif() {
    python3 - "$1" "$2" <<'PY'
import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert("RGB")
b = Image.open(sys.argv[2]).convert("RGB")
d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
print(round(d.histogram()[255] / (a.width * a.height), 4))
PY
}
maior() { python3 -c "import sys; sys.exit(0 if float('$1') > float('$2') else 1)"; }

Xvfb "$TELA" -screen 0 1280x1024x24 >/dev/null 2>&1 &
XPID=$!
sleep 1

echo "== KOFnes ($ALVO): teste de interface"
if [ "$ALVO" = "instalador" ]; then
    export WINEPREFIX="$TMP/wine" WINEDEBUG=-all
    "$WINE" wineboot -i >/dev/null 2>&1
    DESTINO=$("$WINE" winepath -w "$TMP/KOFnes" 2>/dev/null | tr -d '\r')
    "$WINE" "$DIST/KOFnes-instalador-windows.exe" /S "/D=$DESTINO"
    "$WINESERVER" -w
    if [ -f "$TMP/KOFnes/KOFnes.exe" ] && [ -f "$TMP/KOFnes/Desinstalar.exe" ]; then ok "o instalador instalou"; else falha "o instalador não instalou"; fi
    ALVO=windows
    INSTALADO=1
fi
if [ "$ALVO" = "windows" ]; then
    export WINEPREFIX="$TMP/wine" WINEDEBUG=-all
    if [ -z "${INSTALADO:-}" ]; then
        (cd "$TMP" && unzip -q "$DIST/KOFnes-windows-x64.zip")
        "$WINE" wineboot -i >/dev/null 2>&1
    fi
    cp "$ROM" "$TMP/KOFnes/rom-teste.${ROM##*.}"
    # modo de medição: RUNTIME=<pasta> troca o Java do pacote (ex.: pelo
    # inteiro) e JVM_EXTRA passa opções pra JVM pelo próprio KOFnes.exe
    if [ -n "${RUNTIME:-}" ]; then rm -rf "$TMP/KOFnes/runtime"; cp -r "$RUNTIME" "$TMP/KOFnes/runtime"; fi
    (cd "$TMP/KOFnes" && KOFNES_JAVA_OPCOES="${JVM_EXTRA:-}" WINEDLLOVERRIDES="${WINEDLLOVERRIDES:-}" "$WINE" KOFnes.exe >/dev/null 2>&1 &)
    LOG="$TMP/KOFnes/kofnes.log"
    ESPERA=30
else
    (cd "$TMP" && tar xJf "$DIST/KOFnes-linux-x64.tar.xz")
    cp "$ROM" "$TMP/KOFnes/rom-teste.${ROM##*.}"
    env -i DISPLAY="$TELA" HOME="$TMP" PATH=/usr/bin:/bin "$TMP/KOFnes/KOFnes" > "$TMP/kofnes.log" 2>&1 &
    APP=$!
    LOG="$TMP/kofnes.log"
    ESPERA=8
fi
sleep "$ESPERA"

JAN=$(xdotool search --name "KOFnes" | head -1)
if [ -n "$JAN" ]; then ok "janela abriu"; else falha "janela não abriu"; fi
foto "$TMP/0-inicio.png"

# a barra de menu fica no topo da janela; "Arquivo" é o primeiro item
eval "$(xdotool getwindowgeometry --shell "$JAN")"
MX=$((X + 25)); MY=$((Y + 12))
[ "$ALVO" = "windows" ] && MY=$((Y + 9))
xdotool mousemove $MX $MY click 1
sleep 1.5
xdotool mousemove $((MX + 20)) $((MY + 20)) click 1
sleep 5
DLG=$(xdotool search --onlyvisible --name "Abrir ROM" | tail -1)
if [ -n "$DLG" ]; then ok "Arquivo > Abrir ROM abriu o diálogo"; else falha "o diálogo de abrir ROM não apareceu"; fi

# escolhe a ROM pelo campo de nome do arquivo
if [ "$ALVO" = "windows" ]; then
    xdotool type --delay 40 "rom-teste.${ROM##*.}"
    xdotool key Return
else
    xdotool windowfocus "$DLG" 2>/dev/null
    xdotool key --window "$DLG" ctrl+l
    sleep 0.5
    xdotool type --window "$DLG" --delay 30 "$TMP/KOFnes/rom-teste.${ROM##*.}"
    sleep 1
    xdotool key --window "$DLG" Return
fi
# o autocompletar do seletor às vezes engole o primeiro Enter
for tentativa in 1 2 3; do
    sleep 2
    [ -z "$(xdotool search --onlyvisible --name "Abrir ROM" 2>/dev/null)" ] && break
    xdotool key --window "$(xdotool search --onlyvisible --name "Abrir ROM" | tail -1)" Return
done
if [ -z "$(xdotool search --onlyvisible --name "Abrir ROM" 2>/dev/null)" ]; then ok "o diálogo fechou com a ROM escolhida"; else falha "o diálogo continuou aberto"; fi
sleep 14
foto "$TMP/1-titulo.png"
D=$(dif "$TMP/0-inicio.png" "$TMP/1-titulo.png")
if maior "$D" 0.10; then ok "a ROM carregou e o jogo está desenhando (mudou $D da tela)"; else falha "a tela não mudou depois de abrir a ROM ($D)"; fi

# Start
xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT / 2)) click 1
sleep 0.3
xdotool keydown Return; sleep 0.3; xdotool keyup Return
sleep 4
foto "$TMP/2-depois-do-start.png"
D=$(dif "$TMP/1-titulo.png" "$TMP/2-depois-do-start.png")
if maior "$D" 0.10; then ok "Enter (Start) chegou ao jogo (mudou $D da tela)"; else falha "Enter não mudou a tela ($D)"; fi

# o resto do uso normal: pausa, reset, turbo, menus e sair
for k in p p F1; do xdotool key $k; sleep 1; done
xdotool keydown Tab; sleep 2; xdotool keyup Tab; sleep 1
ANTES=$(xdotool getwindowgeometry "$JAN" | grep Geometry)
menu() {  # menu <deslocamento x do menu> <número do item, 1 = primeiro>
    xdotool mousemove $((X + $1)) $MY click 1; sleep 1.5
    foto "$TMP/menu-$1.png"
    xdotool mousemove $((X + $1 + 20)) $((MY + 1 + ITEM_H * $2)) click 1; sleep 2
}
TELA_X=125; AJUDA_X=165; ITEM_H=20
[ "$ALVO" = "windows" ] && { TELA_X=138; AJUDA_X=178; ITEM_H=18; }
menu $TELA_X 1
DEPOIS=$(xdotool getwindowgeometry "$JAN" | grep Geometry)
if [ "$ANTES" != "$DEPOIS" ]; then ok "Tela > Escala 2x mudou a janela (${ANTES#*: } -> ${DEPOIS#*: })"; else falha "Tela > Escala 2x não mudou a janela (${ANTES#*: })"; fi
menu $AJUDA_X 1
menu 25 4
sleep 3
if [ -z "$(xdotool search --name "KOFnes" 2>/dev/null)" ]; then ok "Arquivo > Sair fechou o programa"; else falha "Arquivo > Sair não fechou o programa"; fi

if grep -q -e "Exception" -e "Error:" "$LOG" 2>/dev/null; then
    falha "exceção no log:"; grep -m3 -e "Exception" -e "Error:" "$LOG" | sed 's/^/        /'
else
    ok "nenhuma exceção no log"
fi

[ "$ALVO" = "windows" ] && "$WINESERVER" -k 2>/dev/null
[ -n "$APP" ] && kill "$APP" 2>/dev/null
kill "$XPID" 2>/dev/null
cp "$TMP"/*.png "$DIST/" 2>/dev/null
[ -n "${GUARDAR:-}" ] && cp -r "$TMP/KOFnes" "$GUARDAR"
if [ "$FALHAS" -eq 0 ]; then echo "== PASSOU"; else echo "== $FALHAS FALHA(S) — fotos em $DIST/*.png"; fi
exit "$FALHAS"
