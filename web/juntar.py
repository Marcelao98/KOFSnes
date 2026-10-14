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
partes = {
    "{{CSS}}": (web / "estilo.css").read_text(),
    "{{NUCLEO}}": script,
    "{{APP}}": (web / "estado.js").read_text() + "\n" + (web / "spc.js").read_text() + "\n" + (web / "app.js").read_text(),
    "{{ICONE}}": "data:image/png;base64," + base64.b64encode(icone.read_bytes()).decode(),
    "{{VERSAO}}": versao(),
}
for k, v in partes.items():
    # </script> dentro do código fecharia a tag antes da hora
    pagina = pagina.replace(k, v.replace("</script", "<\\/script"))
destino.write_text(pagina)
print(f"{destino}: {destino.stat().st_size // 1024} KB")
