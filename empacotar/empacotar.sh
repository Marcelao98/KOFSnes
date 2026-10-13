#!/usr/bin/env bash
# Monta os pacotes "baixa e roda" do KOFnes, com Java embutido:
#   dist/KOFnes-instalador-windows.exe  (instalador, LZMA: o menor)
#   dist/KOFnes-windows-x64.zip   (portátil: extrair e abrir o KOFnes.exe)
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

echo "== enxugando o Java do Windows (91 MB -> ~15 MB instalado)"
# O jdk4py traz o Java inteiro (36 módulos, sem jmods). Extraímos as classes do
# lib/modules, ficamos só com java.base/desktop/datatransfer/prefs/xml, podamos
# as classes que o KOFnes nunca usa e rodamos o jlink pro alvo windows-amd64:
#   classes-usadas.txt  classes que o Java carregou numa sessão real (abrir ROM,
#                       jogar, teclado), medidas com -Xlog:class+load no Wine
#   podar_por_uso.py    mantém essas + implementações de serviço + tudo o que
#                       elas podem chamar (jdeps); apaga o resto
#   PodaModulo.java     tira do module-info os pacotes que ficaram vazios
#   TiraHashes.java     tira as impressões digitais antigas do java.base
# Depois de mexer no app/, refaça a medição (testar-interface.sh com
# RUNTIME=<obra>/jre-windows JVM_EXTRA='-Xlog:class+load=info:file=classes.txt' GUARDAR=<dir>).
ENX="$OBRA/jre-windows-enxuto"
# PROFUNDIDADE=0: só as classes carregadas (veja podar_por_uso.py)
export PROFUNDIDADE="${PROFUNDIDADE:-0}"
MODS="java.base java.desktop java.datatransfer java.prefs java.xml"
if [ ! -d "$ENX" ]; then
    T="$OBRA/jlwin"; rm -rf "$T"; mkdir -p "$T/jmods"
    jimage extract --dir "$T/ext" "$OBRA/jre-windows/lib/modules"
    java "$AQUI/TiraHashes.java" "$T/ext/java.base/module-info.class"
    rm -f "$T/ext/java.base/jdk/internal/module/SystemModules\$"*.class
    jdeps -verbose:class -filter:none --multi-release 25 --module-path "$T/ext" \
        $(for m in $MODS; do echo "$T/ext/$m"; done) 2>/dev/null | awk '/->/ {print $1, $3}' > "$T/deps.txt"
    for m in $MODS; do java --describe-module "$m" | { grep '^provides' || true; } | sed 's/^provides //; s/ with / /' | tr ' ' '\n'; done \
        | grep -v '^$' | sort -u > "$T/provedores.txt"
    python3 "$AQUI/podar_por_uso.py" "$T/ext" "$T/deps.txt" "$AQUI/classes-usadas.txt" "$T/provedores.txt" > "$T/vazios.txt"
    for m in $MODS; do
        V=$(awk -v m="$m" '$1==m {print $2}' "$T/vazios.txt")
        [ -n "$V" ] && java "$AQUI/PodaModulo.java" "$T/ext/$m" $V
        jmod create --class-path "$T/ext/$m" --target-platform windows-amd64 "$T/jmods/$m.jmod"
    done
    # compressão interna máxima: o que conta é o tamanho instalado
    jlink --module-path "$T/jmods" --add-modules java.base,java.desktop \
        --disable-plugin generate-jli-classes --compress=zip-9 --strip-debug \
        --no-header-files --no-man-pages --output "$T/img"
    cp -r "$OBRA/jre-windows" "$ENX"
    cp "$T/img/lib/modules" "$ENX/lib/modules"
    cp "$T/img/release" "$ENX/release"
    rm -rf "$ENX/lib/jfr" "$ENX/lib/classlist" "$ENX/lib/jawt.lib" "$ENX/lib/jvm.lib"
    (cd "$ENX/bin" && for f in *.exe; do [ "$f" = java.exe ] || [ "$f" = javaw.exe ] || rm -f "$f"; done
     rm -f attach.dll jdwp.dll dt_shmem.dll dt_socket.dll management.dll management_agent.dll \
        management_ext.dll instrument.dll rmi.dll sunmscapi.dll j2pkcs11.dll j2gss.dll j2pcsc.dll \
        w2k_lsa_auth.dll extnet.dll sspi_bridge.dll jaas.dll splashscreen.dll jawt.dll)
    rm -rf "$ENX/include" "$ENX/lib/security/public_suffix_list.dat" "$ENX/lib/security/cacerts" "$ENX/lib/jrt-fs.jar"
    # o runtime universal do C (ucrtbase + api-ms-*) já vem no Windows 10/11
    rm -f "$ENX/bin/ucrtbase.dll" "$ENX/bin/"api-ms-win-*.dll
    # as DLLs do Java comprimidas com UPX (descomprimem sozinhas ao carregar),
    # menos o awt.dll, que comprimido não carrega;
    # as do runtime do Visual C++ ficam como estão
    (cd "$ENX/bin" && upx -q --best --lzma server/jvm.dll fontmanager.dll freetype.dll \
        mlib_image.dll lcms.dll javajpeg.dll java.dll net.dll nio.dll zip.dll jimage.dll \
        verify.dll prefs.dll >/dev/null)
    rm -rf "$T"
fi

echo "== Windows"
W="$OBRA/win/KOFnes"
rm -rf "$OBRA/win" && mkdir -p "$W"
(cd "$OBRA" && cp "$AQUI/kofnes.rc" . && x86_64-w64-mingw32-windres kofnes.rc -O coff -o kofnes_res.o)
x86_64-w64-mingw32-gcc -O2 -municode -mwindows -o "$W/KOFnes.exe" "$AQUI/kofnes_win.c" "$OBRA/kofnes_res.o"
cp "$OBRA/kofnes.jar" "$W/"
cp -r "$OBRA/jre-windows-enxuto" "$W/runtime"
sed 's/$/\r/' "$AQUI/LEIA-ME.txt" > "$W/LEIA-ME.txt"
rm -f "$DIST/KOFnes-windows-x64.zip"
(cd "$OBRA/win" && zip -qr -9 "$DIST/KOFnes-windows-x64.zip" KOFnes)
cp "$OBRA/icone.ico" "$OBRA/win/"
rm -f "$DIST/KOFnes-instalador-windows.exe"
makensis -V2 -DORIGEM="$OBRA/win/KOFnes" -DICONE="$OBRA/win/icone.ico" \
    -DSAIDA="$DIST/KOFnes-instalador-windows.exe" "$AQUI/instalador.nsi"

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
