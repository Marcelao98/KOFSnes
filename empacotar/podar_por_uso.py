"""Poda os módulos extraídos do Java mantendo só o que o KOFnes usa.

Uso: podar_por_uso.py <dir-ext> <deps.txt> <classes-carregadas.txt> <provedores.txt>
  classes-carregadas: um nome de classe por linha (empacotar/classes-usadas.txt,
      tirado do -Xlog:class+load de uma sessão real: abrir ROM, jogar), ou o
      próprio log do -Xlog
  provedores: classes de implementação de serviços (provides ... with ...)
Mantém: as classes carregadas + implementações de serviço + o que elas
referenciam até PROFUNDIDADE passos no grafo do jdeps (o empacotar.sh usa 0; o fecho
inteiro leva 11.600 classes e ~18 MB, uma volta leva bem menos). As classes
do JDK não passam pelo verificador, então só caminho de código executado
carrega classe: a volta extra é margem pra caminhos que o teste não pegou. Apaga o resto e imprime, por módulo, os
pacotes que ficaram vazios: "modulo pacote/interno".
"""
import collections
import os
import re
import sys

ext, deps_arq, log_arq, prov_arq = sys.argv[1:5]
usa = collections.defaultdict(set)
for linha in open(deps_arq):
    p = linha.split()
    if len(p) == 2:
        usa[p[0]].add(p[1])
raizes = set()
for linha in open(log_arq, errors="replace"):
    m = re.search(r"\[class,load\] (\S+) source: jrt:/", linha)
    if m:
        raizes.add(m.group(1))
    elif linha.strip() and " " not in linha.strip():
        raizes.add(linha.strip())
raizes |= {l.strip() for l in open(prov_arq) if l.strip()}
profundidade = int(os.environ.get("PROFUNDIDADE", "1"))
manter, borda = set(raizes), set(raizes)
for _ in range(profundidade):
    borda = {b for c in borda for b in usa.get(c, ()) if b not in manter}
    manter |= borda
# pacotes que vão inteiros: o que muda entre o Wine do teste e um Windows de
# verdade (som: o Wine do teste não tem placa, então o Java nem chega a abrir
# a saída; janela e fontes: drivers e fontes do sistema)
INTEIROS = os.environ.get("PACOTES_INTEIROS",
    "com/sun/media/sound javax/sound sun/awt/windows sun/java2d/windows sun/font").split()
for mod in os.listdir(ext):
    base = os.path.join(ext, mod)
    for pac in INTEIROS:
        d = os.path.join(base, pac)
        for raiz, _, fs in os.walk(d):
            for f in fs:
                if f.endswith(".class"):
                    manter.add(os.path.relpath(os.path.join(raiz, f), base)[:-6].replace(os.sep, "."))
# toda classe de erro/exceção fica: um caminho que o teste não pegou ao menos
# quebra com a mensagem certa, não com NoClassDefFoundError da própria exceção
for mod in os.listdir(ext):
    base = os.path.join(ext, mod)
    for d, _, fs in os.walk(base):
        for f in fs:
            if f.endswith(("Exception.class", "Error.class")):
                manter.add(os.path.relpath(os.path.join(d, f), base)[:-6].replace(os.sep, "."))
# classes internas (Externa$Interna) andam junto com a externa
total = apagadas = 0
for mod in os.listdir(ext):
    base = os.path.join(ext, mod)
    for d, _, fs in os.walk(base):
        for f in fs:
            if not f.endswith(".class") or f == "module-info.class":
                continue
            total += 1
            nome = os.path.relpath(os.path.join(d, f), base)[:-6].replace(os.sep, ".")
            externa = nome.split("$")[0]
            if nome not in manter and externa not in manter:
                os.remove(os.path.join(d, f))
                apagadas += 1
    for d, _, _ in sorted(os.walk(base), key=lambda t: -len(t[0])):
        if d == base:
            continue
        if not any(f.endswith(".class") for f in os.listdir(d)):
            print(mod, os.path.relpath(d, base).replace(os.sep, "/"))
        if not os.listdir(d):
            os.rmdir(d)
sys.stderr.write(f"{apagadas} de {total} classes apagadas ({len(raizes)} raízes, {len(manter)} no fecho)\n")
