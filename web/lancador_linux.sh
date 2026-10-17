#!/bin/sh
# kofnes.sh: o KOFnes.exe do Linux. Atualiza o KOFnes.html pelo GitHub e abre ele
# numa janela de app de um navegador baseado em Chromium (Chrome, Chromium, Edge,
# Brave, Vivaldi; instalado normal, Snap ou Flatpak). POSIX sh: roda em qualquer distro.
#   ./kofnes.sh              abre (atualizando antes, se tiver versão nova)
#   ./kofnes.sh --instalar   põe o KOFnes no menu de aplicativos (KDE, GNOME, XFCE...)
#   ./kofnes.sh --desinstalar
# Dá pra trocar o navegador com KOFNES_NAVEGADOR=/caminho/do/navegador. Se existir um
# arquivo "nao-atualizar" do lado do script, ele não procura atualização.
LANCADOR=1
BASE="${KOFNES_URL:-https://raw.githubusercontent.com/Marcelao98/KOFSnes/main/publicado}"

eu="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
dir="$(cd "$(dirname "$eu")" && pwd)"
html="$dir/KOFnes.html"
log="$dir/atualizacao.log"
dados="${XDG_DATA_HOME:-$HOME/.local/share}"

anotar() { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*" >>"$log" 2>/dev/null; }

avisar() {   # janelinha se der, senão o terminal
    if command -v kdialog >/dev/null 2>&1; then kdialog --title KOFnes --error "$*" 2>/dev/null
    elif command -v zenity >/dev/null 2>&1; then zenity --error --title KOFnes --text "$*" 2>/dev/null
    elif command -v notify-send >/dev/null 2>&1; then notify-send KOFnes "$*" 2>/dev/null
    fi
    printf 'KOFnes: %s\n' "$*" >&2
}

case "$1" in
--instalar)
    mkdir -p "$dados/applications" || exit 1
    cat >"$dados/applications/kofnes.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=KOFnes
Comment=Emulador de Super Nintendo escrito em Kof
Exec="$dir/kofnes.sh"
Icon=$dir/KOFnes.png
Terminal=false
Categories=Game;Emulator;
StartupWMClass=KOFnes
EOF
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$dados/applications" 2>/dev/null
    echo "KOFnes instalado no menu de aplicativos."
    exit 0 ;;
--desinstalar)
    rm -f "$dados/applications/kofnes.desktop"
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$dados/applications" 2>/dev/null
    echo "KOFnes tirado do menu de aplicativos."
    exit 0 ;;
esac

if [ ! -f "$html" ]; then
    avisar "não achei o KOFnes.html do lado do kofnes.sh. Extraia a pasta inteira antes de abrir."
    exit 1
fi

# ---------------- atualizador ----------------
# lê "campo=número" de um versao.txt (0 se não tem)
campo() { n="$(sed -n "s/^$2=\([0-9][0-9]*\).*/\1/p" "$1" 2>/dev/null | head -n 1)"; printf '%s' "${n:-0}"; }
tamanho() { if [ -f "$1" ]; then wc -c <"$1" | tr -d ' '; else echo 0; fi; }

# baixa BASE/nome pra destino em até N segundos; devolve 0 se deu certo
baixar() {
    url="$BASE/$1?t=$(date +%s)"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --connect-timeout 8 --max-time "$3" -o "$2" "$url" 2>/dev/null; r=$?
    elif command -v wget >/dev/null 2>&1; then
        wget -q -T 15 -O "$2" "$url" 2>/dev/null; r=$?
    else
        anotar "não tem curl nem wget: instale um dos dois pra atualizar"; return 127
    fi
    [ "$r" -eq 0 ] || { anotar "falhou baixar $1 (código $r)"; rm -f "$2"; }
    return "$r"
}

atualizar() {
    aqui="$(campo "$dir/versao.txt" versao)"
    anotar "KOFnes (lançador linux $LANCADOR) · versão daqui: $aqui · pasta: $dir"
    baixar versao.txt "$dir/versao.txt.novo" 12 || { anotar "sem conexão com o GitHub: abrindo a versão daqui"; return; }
    nova="$(campo "$dir/versao.txt.novo" versao)"; tam="$(campo "$dir/versao.txt.novo" tamanho)"
    lanc="$(campo "$dir/versao.txt.novo" lancador_linux)"; tamsh="$(campo "$dir/versao.txt.novo" tamanho_linux)"
    anotar "versão no GitHub: $nova (lançador linux $lanc)"
    trocou=0
    if [ "$nova" -gt "$aqui" ] && [ "$tam" -gt 0 ]; then
        if baixar KOFnes.html "$html.novo" 90 && [ "$(tamanho "$html.novo")" = "$tam" ] \
            && head -c 14 "$html.novo" | grep -qi '<!doctype html'; then
            mv -f "$html.novo" "$html" && trocou=1 && anotar "atualizado pra versão $nova" \
                || anotar "não consegui trocar o KOFnes.html: a pasta deixa gravar?"
        else
            anotar "KOFnes.html veio errado ($(tamanho "$html.novo") bytes, esperava $tam): fica a versão daqui"
        fi
        rm -f "$html.novo"
    else
        anotar "já está na versão mais nova"
    fi
    if [ "$lanc" -gt "$LANCADOR" ] && [ "$tamsh" -gt 0 ]; then
        if baixar kofnes.sh "$eu.novo" 30 && [ "$(tamanho "$eu.novo")" = "$tamsh" ] && head -c 2 "$eu.novo" | grep -q '^#!'; then
            chmod +x "$eu.novo" && mv -f "$eu.novo" "$eu" && anotar "kofnes.sh atualizado pro lançador $lanc (vale na próxima vez)" \
                || anotar "não consegui trocar o kofnes.sh"
        else
            anotar "kofnes.sh veio errado (esperava $tamsh bytes)"
        fi
        rm -f "$eu.novo"
    fi
    if [ "$trocou" -eq 1 ] || [ "$nova" -le "$aqui" ]; then mv -f "$dir/versao.txt.novo" "$dir/versao.txt"; else rm -f "$dir/versao.txt.novo"; fi
}

if [ ! -e "$dir/nao-atualizar" ]; then
    [ "$(tamanho "$log")" -gt 32768 ] 2>/dev/null && : >"$log"   # o registro guarda só as últimas aberturas
    anotar "---- abrindo"
    atualizar
fi

# ---------------- navegador ----------------
nav=""; flat=""
if [ -n "$KOFNES_NAVEGADOR" ]; then
    nav="$KOFNES_NAVEGADOR"
else
    for n in google-chrome-stable google-chrome chromium chromium-browser microsoft-edge-stable microsoft-edge \
             brave-browser brave vivaldi-stable vivaldi ungoogled-chromium opera; do
        if command -v "$n" >/dev/null 2>&1; then nav="$(command -v "$n")"; break; fi
    done
    if [ -z "$nav" ] && command -v flatpak >/dev/null 2>&1; then
        for id in org.chromium.Chromium com.google.Chrome com.brave.Browser com.microsoft.Edge com.vivaldi.Vivaldi \
                  io.github.ungoogled_software.ungoogled_chromium; do
            if flatpak info "$id" >/dev/null 2>&1; then flat="$id"; nav="flatpak"; break; fi
        done
    fi
fi
if [ -z "$nav" ]; then
    anotar "nenhum navegador Chromium encontrado"
    if command -v xdg-open >/dev/null 2>&1; then
        avisar "não achei Chrome, Chromium, Edge, Brave nem Vivaldi. Vou abrir no navegador padrão, mas o Firefox não tem tudo que o KOFnes usa (pasta de ROMs, salvar perfil). Instale um Chromium pra ter tudo."
        exec xdg-open "$html"
    fi
    avisar "não achei um navegador baseado em Chromium (Chrome, Chromium, Edge, Brave, Vivaldi). Instale um e abra de novo."
    exit 1
fi

perfil="$dados/KOFnes/navegador"
case "$nav" in /snap/*|*/snap/bin/*) perfil="$HOME/snap/$(basename "$nav")/common/KOFnes" ;; esac   # o Snap só grava ali
mkdir -p "$perfil" 2>/dev/null
anotar "navegador: $nav${flat:+ ($flat)}"

set -- --app="file://$html" --class=KOFnes --no-first-run --no-default-browser-check \
       --autoplay-policy=no-user-gesture-required --window-size=840,780 --ozone-platform-hint=auto $KOFNES_ARGS
if [ -n "$flat" ]; then
    exec flatpak run "$flat" "$@"      # o Flatpak tem perfil próprio e só enxerga o que o sandbox deixa
fi
exec "$nav" --user-data-dir="$perfil" "$@"
