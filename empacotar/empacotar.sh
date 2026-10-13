#!/usr/bin/env bash
# Monta os pacotes "baixa e roda" do KOFnes, com Java embutido:
#   dist/KOFnes-windows-x64.zip   (KOFnes.exe)
#   dist/KOFnes-linux-x64.tar.xz  (KOFnes)
# Precisa: kof (0.6.3+) e JDK 25 (jar), python3 + Pillow, gcc e
# x86_64-w64-mingw32-gcc/windres. O JRE vem do pacote jdk4py do PyPI.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
OBRA="${OBRA:-$AQUI/.obra}"
DIST="$RAIZ/dist"
JRE_VER="${JRE_VER:-25.0.2.1}"
mkdir -p "$OBRA" "$DIST"

echo "== compilando o KOFnes"
rm -rf "$OBRA/classes"
(cd "$RAIZ" && kof build KOFnes.kf --output "$OBRA/classes")

echo "== kofnes.jar"
printf 'Main-Class: Default.Main\n' > "$OBRA/manifest.txt"
rm -f "$OBRA/kofnes.jar"
jar --create --file "$OBRA/kofnes.jar" --manifest "$OBRA/manifest.txt" -C "$OBRA/classes" .

echo "== ícone"
python3 "$AQUI/icone.py" "$OBRA"

echo "== JRE $JRE_VER (jdk4py)"
python3 - "$OBRA" "$JRE_VER" <<'PY'
import json, os, sys, urllib.request, zipfile
obra, ver = sys.argv[1], sys.argv[2]
info = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/jdk4py/{ver}/json"))
for alvo, tag in (("windows", "win_amd64"), ("linux", "manylinux_2_17_x86_64")):
    dst = os.path.join(obra, "jre-" + alvo)
    if os.path.isdir(dst):
        continue
    url = next(f["url"] for f in info["urls"] if tag in f["filename"])
    whl = os.path.join(obra, tag + ".whl")
    if not os.path.exists(whl):
        print("baixando", url)
        urllib.request.urlretrieve(url, whl)
    with zipfile.ZipFile(whl) as z:
        for m in z.infolist():
            if m.filename.startswith("jdk4py/java-runtime/"):
                rel = m.filename[len("jdk4py/java-runtime/"):]
                if not rel:
                    continue
                p = os.path.join(dst, rel)
                if m.is_dir():
                    os.makedirs(p, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with z.open(m) as a, open(p, "wb") as b:
                    b.write(a.read())
                modo = (m.external_attr >> 16) & 0o777
                if modo:
                    os.chmod(p, modo)
    # zip de wheel nem sempre guarda o bit de execução
    for d, _, fs in os.walk(os.path.join(dst, "bin")):
        for f in fs:
            os.chmod(os.path.join(d, f), 0o755)
    for f in ("jspawnhelper",):
        p = os.path.join(dst, "lib", f)
        if os.path.exists(p):
            os.chmod(p, 0o755)
PY

echo "== Windows"
W="$OBRA/win/KOFnes"
rm -rf "$OBRA/win" && mkdir -p "$W"
(cd "$OBRA" && cp "$AQUI/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o kofnes_res.o)
x86_64-w64-mingw32-gcc -O2 -municode -mwindows -o "$W/KOFnes.exe" "$AQUI/kofnes_win.c" "$OBRA/kofnes_res.o"
cp "$OBRA/kofnes.jar" "$W/"
cp -r "$OBRA/jre-windows" "$W/runtime"
sed 's/$/\r/' "$AQUI/LEIA-ME.txt" > "$W/LEIA-ME.txt"
rm -f "$DIST/KOFnes-windows-x64.zip"
(cd "$OBRA/win" && zip -qr -9 "$DIST/KOFnes-windows-x64.zip" KOFnes)

echo "== Linux"
L="$OBRA/linux/KOFnes"
rm -rf "$OBRA/linux" && mkdir -p "$L"
gcc -O2 -o "$L/KOFnes" "$AQUI/kofnes_unix.c"
cp "$OBRA/kofnes.jar" "$L/"
cp -r "$OBRA/jre-linux" "$L/runtime"
cp "$AQUI/LEIA-ME.txt" "$OBRA/icone.png" "$L/"
rm -f "$DIST/KOFnes-linux-x64.tar.xz"
(cd "$OBRA/linux" && tar -cJf "$DIST/KOFnes-linux-x64.tar.xz" KOFnes)

ls -la "$DIST"
