"""Junta a saída do `kof build --target js` com a interface num HTML só.

Uso: juntar.py <saida-do-kof> <pasta-web> <icone.png> <KOFnes.html>

Navegador não carrega módulos ES de um arquivo local (file://), então os
módulos viram um script comum dentro de uma função: o runtime do Kof, o
núcleo (snes/ compilado) e a interface (app.js), mais o CSS dos temas.

Modo rápido: o kofArrayGet/kofArraySet do runtime conferem os limites do
array a cada acesso; aqui a leitura e a escrita sem estreitamento vão
direto. O núcleo mascara todos os índices (& 0x7FFF, & 0xFFFF...), e a
saída é a mesma do JVM bit a bit; o ganho é de ~50% nos quadros pesados.
"""
import base64
import pathlib
import re
import sys

saida_kof, web, icone, destino = (pathlib.Path(a) for a in sys.argv[1:5])
# 5º argumento (opcional): a pasta com os núcleos (nucleo-libretro/saida: snes9x.js, gambatte.js...) -> gera o
# KOFnes-android.html (núcleos libretro + controle virtual)
android = pathlib.Path(sys.argv[5]) if len(sys.argv) > 5 else None


def versao():
    """commit do git + data do build: vai no relatório de bug"""
    import datetime
    import subprocess
    try:
        c = subprocess.run(["git", "-C", str(web), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError:
        c = ""
    import os
    build = os.environ.get("KOFNES_BUILD") or datetime.datetime.utcnow().strftime("%Y%m%d%H%M")
    return build + " · " + (c or "sem-git")

runtime = (saida_kof / "kof-runtime.mjs").read_text()
runtime = re.sub(r"^export (function|const|let|class) ", r"\1 ", runtime, flags=re.M)
for nome, rapido in [
    ("kofArrayGet(array, index) {", "    return array[index];\n"),
    ("kofArraySet(array, index, value, kind) {", "    if (kind === 0) { array[index] = value; return; }\n"),
]:
    i = runtime.index(nome) + len(nome) + 1
    runtime = runtime[:i] + rapido + runtime[i:]

nucleo = (saida_kof / "Default.mjs").read_text()
nucleo = re.sub(r"^import .*$", "", nucleo, flags=re.M)
nucleo = re.sub(r"^//# sourceMappingURL=.*$", "", nucleo, flags=re.M)
nucleo = re.sub(r"^main\(\);\s*$", "", nucleo, flags=re.M)
if "class snes_Snes" not in nucleo:
    sys.exit("juntar.py: snes_Snes não apareceu na saída do Kof")

script = (
    "const KofNucleo = (() => {\n'use strict';\n" + runtime + "\n" + nucleo
    + "\nreturn { Snes: snes_Snes, Apu: snes_Apu };\n})();\n"
)
pagina = (web / "pagina.html").read_text()
if android:
    pagina = pagina.replace('<html lang="pt-BR"', '<html class="celular" lang="pt-BR"', 1)
    pagina = pagina.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="theme-color" content="#1a110b">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icone-192.png">\n<meta name="mobile-web-app-capable" content="yes">', 1)
app_js = (web / "app.js").read_text()
if android:   # o app.js é uma função só ((() => {...})()): o código do celular entra por dentro, antes do fecha-parênteses final
    fim = app_js.rstrip().rfind("})();")
    app_js = app_js[:fim] + "\n" + (web / "android.js").read_text() + "\n" + app_js[fim:]
partes = {
    "{{CSS}}": (web / "estilo.css").read_text() + ((web / "android.css").read_text() if android else ""),
    "{{NUCLEO}}": script,
    "{{APP}}": (
        ("".join(f.read_text() + "\n" for f in sorted(android.glob("*.js"))) if android else "")   # todos os núcleos compilados (snes9x.js, gambatte.js...)
        + (web / "estado.js").read_text() + "\n" + (web / "spc.js").read_text() + "\n"
        + ((web / "nucleo.js").read_text() + "\n" if android else "")   # depois do estado.js: ele troca o savestate pelo do núcleo libretro
        + app_js
    ),
    "{{ICONE}}": "data:image/png;base64," + base64.b64encode(icone.read_bytes()).decode(),
    "{{VERSAO}}": versao(),
}
for k, v in partes.items():
    # </script> dentro do código fecharia a tag antes da hora
    pagina = pagina.replace(k, v.replace("</script", "<\\/script"))
destino.write_text(pagina)
print(f"{destino}: {destino.stat().st_size // 1024} KB")
