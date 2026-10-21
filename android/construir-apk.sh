#!/usr/bin/env bash
# Monta o KOFstation.apk: uma WebView nativa (android/src) com o dist/web/KOFnes-android.html dentro (assets/index.html).
# Sem Gradle e sem SDK completo: usa só as ferramentas do Ubuntu (apt install aapt apksigner zipalign libandroid-23-java
# dalvik-exchange android-sdk-platform-23) + JDK. Antes: web/compilar.sh (gera o KOFnes-android.html).
#   android/construir-apk.sh            -> dist/KOFstation.apk
# A chave de assinatura (kofnes-teste.keystore) é de TESTE: serve pra instalar direto no celular e atualizar por cima.
# Pra Play Store vai precisar de uma chave de verdade (e de um AAB), guardada fora do repositório.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(dirname "$AQUI")"
HTML="$RAIZ/dist/web/KOFnes-android.html"; [ -f "$HTML" ] || { echo "falta $HTML (rode web/compilar.sh antes)"; exit 1; }
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
W="${W:-$RAIZ/dist/apk-work}"; rm -rf "$W"; mkdir -p "$W/classes" "$W/assets" "$W/res" "$W/src"
# versão: código cresce a cada build (minutos desde 1/1/2026), nome = data
CODIGO="$(python3 -c 'import time; print((int(time.time()) - 1767225600) // 60)')"; NOME="$(date -u +%Y.%m.%d.%H%M)"
cp -r "$AQUI/res/." "$W/res/"; cp -r "$AQUI/src/." "$W/src/"
sed "s/@VERSAO_CODE@/$CODIGO/; s/@VERSAO_NOME@/$NOME/" "$AQUI/AndroidManifest.xml" > "$W/AndroidManifest.xml"
find "$W/src" -name '*.java' -exec sed -i "s/@VERSAO_NOME@/$NOME/" {} +
cp "$HTML" "$W/assets/index.html"
# núcleos (nucleos/<núcleo>-<hash>.js): o html carrega cada um só quando abre um jogo daquele console
cp -r "$RAIZ/dist/web/nucleos" "$W/assets/"
# versão da página que vai dentro (o Atualizador compara com a publicada em publicado/android/versao.txt)
grep '^versao=' "$RAIZ/dist/web/versao.txt" > "$W/assets/versao.txt"
# ícone (vários tamanhos a partir do ícone do KOFnes)
python3 - "$RAIZ/dist/web/KOFnes.png" "$W/res" <<'PY'
import os, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
for d, n in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    os.makedirs(f"{sys.argv[2]}/mipmap-{d}", exist_ok=True)
    im.resize((n, n), Image.NEAREST).save(f"{sys.argv[2]}/mipmap-{d}/ic_launcher.png")
PY
javac --release 8 -Xlint:-options -cp "$ANDROID_JAR" -d "$W/classes" $(find "$W/src" -name '*.java') 2>&1 | grep -v "^Picked up" || true
dalvik-exchange --dex --min-sdk-version=24 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v "^Picked up" || true
aapt package -f -M "$W/AndroidManifest.xml" -S "$W/res" -A "$W/assets" -I "$ANDROID_JAR" --min-sdk-version 24 --target-sdk-version 34 -F "$W/base.apk"
(cd "$W" && aapt add base.apk classes.dex >/dev/null)
zipalign -f -p 4 "$W/base.apk" "$W/alinhado.apk"
KS="$AQUI/kofnes-teste.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass kofnes-teste -keypass kofnes-teste -alias kofnes -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=KOFnes teste, O=KOFnes, C=BR" 2>&1 | grep -v "^Picked up" || true
OUT="$RAIZ/dist/KOFstation.apk"
apksigner sign --ks "$KS" --ks-pass pass:kofnes-teste --key-pass pass:kofnes-teste --ks-key-alias kofnes --out "$OUT" "$W/alinhado.apk" 2>&1 | grep -v "^Picked up" || true
apksigner verify -v "$OUT" 2>&1 | grep -v "^Picked up" | head -8 || true
ls -l "$OUT"
