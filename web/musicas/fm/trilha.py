"""Trilha do KOFstation no som do Mega Drive (YM2612 FM + PSG), tocando no chip de verdade (o Genesis Plus GX emulado).

Cada música vira uma lista de comandos pros chips (YM2612 parte I/II, PSG, espera N quadros, loop), gerada a partir das
partituras (escritas aqui como texto) e dos instrumentos FM desenhados aqui. Saída: web/musicas/trilha.js (KofTrilha: id,
título, autor, segundos, comandos em base64), tocada pelo núcleo só de som (nucleo-libretro/somfm.c, ~80 KB).
Com --rom <pasta>, grava também uma ROM de Mega Drive por música (o tocador em 68000, tocador.s -> tocador.bin, em 0x200
e os comandos em 0x800), que toca em qualquer emulador de Mega Drive.
Todas as músicas são de domínio público (composição) e o arranjo é nosso; ver a fonte de cada partitura abaixo.
Uso: python3 web/musicas/fm/trilha.py [--rom <pasta>]
"""
import base64
import json
import math
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
QUADROS = 60.0                     # o tocador anda um quadro por vblank (NTSC)
CLOCK_FM, CLOCK_PSG = 7670453, 3579545

# ---------------- instrumentos FM ----------------
# cada operador: (DT, MUL, TL, RS, AR, AM, D1R, D2R, D1L, RR), na ordem S1, S2, S3, S4; mais (ALG, FB).
# TL é atenuação (0 = mais alto); nos operadores de saída (portadores) ele é o volume do instrumento.
def op(mul, tl, ar=31, d1r=0, d2r=0, d1l=0, rr=7, dt=0, rs=0):
    return (dt, mul, tl, rs, ar, 0, d1r, d2r, d1l, rr)

PATCH = {
    # flauta / lead suave: dois pares (ALG 4), modulador fraco, ataque um pouco lento
    'flauta': (4, 3, [op(1, 42, 22, 2, 0, 1, 6), op(1, 22, 20, 2, 1, 1, 7), op(2, 56, 22, 4, 0, 2, 6, dt=3), op(1, 26, 20, 2, 1, 1, 7, dt=7)]),
    # cordas: ataque lento, sustenta
    'cordas': (4, 2, [op(1, 40, 15, 0, 0, 0, 5), op(1, 26, 14, 1, 0, 1, 5, dt=3), op(2, 48, 15, 0, 0, 0, 5), op(1, 28, 13, 1, 0, 1, 5, dt=5)]),
    # metais: brilho que abre no ataque
    'metais': (4, 5, [op(1, 30, 24, 6, 2, 3, 7), op(1, 18, 26, 3, 1, 2, 7), op(1, 36, 22, 5, 2, 3, 7, dt=3), op(1, 22, 26, 3, 1, 2, 7, dt=5)]),
    # baixo FM de Mega Drive: série (ALG 0), punch no ataque
    'baixo': (0, 5, [op(0, 34, 31, 10, 4, 5, 8), op(1, 44, 31, 12, 4, 6, 8), op(1, 32, 31, 12, 4, 5, 8), op(1, 10, 31, 6, 3, 4, 9)]),
    # piano elétrico: modulador que some rápido
    'piano': (4, 4, [op(4, 40, 31, 14, 4, 6, 7), op(1, 22, 31, 6, 3, 4, 7), op(1, 34, 31, 10, 4, 5, 7), op(1, 24, 31, 6, 3, 4, 7, dt=3)]),
    # sanfona / órgão: aditivo (ALG 7), quatro portadores
    'sanfona': (7, 0, [op(1, 34, 28, 0, 0, 0, 8), op(2, 38, 28, 0, 0, 0, 8, dt=3), op(1, 36, 28, 0, 0, 0, 8, dt=5), op(4, 46, 28, 0, 0, 0, 8)]),
    # cavaquinho: palhetada curta
    'cavaco': (4, 4, [op(3, 32, 31, 18, 8, 6, 10), op(1, 24, 31, 12, 8, 6, 10), op(2, 38, 31, 16, 8, 6, 10), op(1, 28, 31, 12, 8, 6, 10, dt=3)]),
    # sino / caixinha de música
    'sino': (4, 3, [op(7, 34, 31, 8, 4, 5, 6), op(2, 24, 31, 6, 4, 5, 6), op(3, 40, 31, 10, 4, 5, 6), op(1, 30, 31, 6, 4, 5, 6)]),
}
SLOT = [0, 8, 4, 12]   # S1, S2, S3, S4 -> deslocamento do registrador (o YM2612 guarda na ordem S1, S3, S2, S4)
PORTADORES = {0: [3], 1: [3], 2: [3], 3: [3], 4: [1, 3], 5: [1, 2, 3], 6: [1, 2, 3], 7: [0, 1, 2, 3]}

def fm_patch(c, nome, volume=0):
    """comandos que carregam o instrumento `nome` no canal c (0-5); volume = atenuação extra nos portadores"""
    alg, fb, ops = PATCH[nome]
    parte, ch = (0, c) if c < 3 else (1, c - 3)
    cmds = []
    for s, (dt, mul, tl, rs, ar, am, d1r, d2r, d1l, rr) in enumerate(ops):
        o = SLOT[s] + ch
        if s in PORTADORES[alg]:
            tl = max(0, min(127, tl + volume - 6))   # -6: a trilha um pouco mais alta que o padrão dos instrumentos
        for reg, val in ((0x30, dt << 4 | mul), (0x40, tl), (0x50, rs << 6 | ar), (0x60, am << 7 | d1r), (0x70, d2r),
                         (0x80, d1l << 4 | rr), (0x90, 0)):
            cmds.append((parte, reg + o, val))
    cmds += [(parte, 0xB0 + ch, fb << 3 | alg), (parte, 0xB4 + ch, 0xC0)]
    return cmds

def fm_nota(c, midi):
    parte, ch = (0, c) if c < 3 else (1, c - 3)
    f = 440.0 * 2 ** ((midi - 69) / 12)
    for bloco in range(8):
        fn = round(f * 144 * 2 ** 20 / CLOCK_FM / 2 ** (bloco - 1)) if bloco else round(f * 144 * 2 ** 21 / CLOCK_FM)
        if fn < 2048:
            break
    codigo = ch | (4 if parte else 0)
    return [(parte, 0xA4 + ch, bloco << 3 | fn >> 8), (parte, 0xA0 + ch, fn & 0xFF), (0, 0x28, 0xF0 | codigo)]

def fm_solta(c):
    return [(0, 0x28, (c if c < 3 else c - 3) | (4 if c >= 3 else 0))]

def psg_tom(n, midi, att):
    div = max(1, min(1023, round(CLOCK_PSG / (32 * 440.0 * 2 ** ((midi - 69) / 12)))))
    return [(2, 0x80 | n << 5 | div & 0xF), (2, div >> 4 & 0x3F), (2, 0x90 | n << 5 | att)]

def psg_volume(n, att):
    return [(2, 0x90 | n << 5 | min(15, att))]

# ---------------- partituras ----------------
NOTA = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(t):
    m = re.match(r'^([A-G])(b|#)?(-?\d)$', t)
    return 12 * (int(m.group(3)) + 1) + NOTA[m.group(1)] + {'b': -1, '#': 1, None: 0}[m.group(2)]

def ler(texto, transpor=0):
    """'E5:.5 A5:1 -:.5 ...' -> [(início, duração, nota MIDI)] em tempos"""
    t, notas = 0.0, []
    for p in texto.split():
        n, d = p.split(':')
        if n != '-':
            notas.append((t, float(d), midi(n) + transpor))
        t += float(d)
    return notas, t

# acordes: fundamental + qualidade (m, 7, m7, maj7, ø = meio-diminuto, dim, 6)
INTERVALOS = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11],
              'ø': [0, 3, 6, 10], 'dim': [0, 3, 6, 9], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9]}
def acorde(nome):
    m = re.match(r'^([A-G])(b|#)?(maj7|m7|m6|m|7|ø|dim|6)?$', nome)
    raiz = NOTA[m.group(1)] + {'b': -1, '#': 1, None: 0}[m.group(2)]
    iv = INTERVALOS[m.group(3) or '']
    baixo = 36 + (raiz % 12)                          # C2..B2
    if baixo > 43:
        baixo -= 12
    voz = sorted(55 + ((raiz + i - 55) % 12) for i in iv)[:3] if len(iv) == 3 else \
        sorted(55 + ((raiz + i - 55) % 12) for i in (iv[1], iv[2], iv[3]))   # sem a fundamental (tá no baixo)
    return baixo, baixo + 7 if iv[2] == 7 else baixo + iv[2], voz

# ---------------- arranjo -> eventos -> comandos ----------------
def arranjar(m):
    """eventos (tempo em tempos, prioridade, comandos) de uma música"""
    ev = []
    def nota_fm(c, ini, dur, n, legato=0.92):
        ev.append((ini, 1, fm_nota(c, n)))
        ev.append((ini + max(dur * legato, 0.05), 0, fm_solta(c)))
    vozes = m['vozes']
    canais = [0, 1, 2]
    for c, (notas, _patch) in zip(canais, vozes):
        for ini, dur, n in notas:
            nota_fm(c, ini, dur, n, 0.94 if c else 0.92)
    total = m['tempos']
    comp, ana = m.get('compasso', 4), m.get('anacruse', 0)
    acordes = []
    for k, barra in enumerate(m.get('acordes', '').split('|') if m.get('acordes') else []):
        nomes = barra.split()
        for j, a in enumerate(nomes):
            acordes.append((ana + k * comp + j * comp / len(nomes), comp / len(nomes), a))
    estilo = m.get('estilo', {})
    for ini, dur, a in acordes:
        b, quinta, voz = acorde(a)
        # baixo (FM 3 quando a música não traz o baixo escrito)
        if estilo.get('baixo') and len(vozes) < 3:
            if estilo['baixo'] == 'raiz':
                nota_fm(2, ini, dur, b, 0.9)
            else:   # marcha/choro: fundamental e quinta alternando a cada tempo
                for i in range(int(round(dur))):
                    nota_fm(2, ini + i, 1, b if i % 2 == 0 else quinta - 12 if quinta - 12 >= 31 else quinta, 0.7)
        # acordes: sustentados (pad) ou palhetadas nos contratempos (stab)
        if estilo.get('acorde') == 'pad':
            for i, n in enumerate(voz):
                nota_fm(3 + i, ini, dur, n, 0.97)
        elif estilo.get('acorde') == 'stab':
            for k in range(int(round(dur))):
                for i, n in enumerate(voz):
                    nota_fm(3 + i, ini + k + 0.5, 0.35, n, 0.9)
        # caixinha de música no PSG (arpejo em colcheias, com decaimento)
        if estilo.get('arpejo'):
            for k in range(int(round(dur * 2))):
                n = voz[k % len(voz)] + 12
                t = ini + k * 0.5
                ev.append((t, 1, psg_tom(0, n, 3)))
                for q, att in enumerate((5, 7, 9, 11, 13, 15)):
                    ev.append((t + (q + 1) * 0.06, 0, psg_volume(0, att)))
    # chimbal: ruído branco curtinho (colcheias, mais forte no contratempo)
    if estilo.get('chimbal'):
        passo = estilo['chimbal']
        k = 0
        while k * passo < total - 0.01:
            t = k * passo
            forte = abs((t % 1) - 0.5) < 0.01
            ev.append((t, 1, [(2, 0xE4)] + psg_volume(3, 4 if forte else 7)))
            ev.append((t + 0.04, 0, psg_volume(3, 11)))
            ev.append((t + 0.08, 0, psg_volume(3, 15)))
            k += 1
    return ev

def gerar_comandos(m):
    seg = 60.0 / m['bpm']
    init = [(0, 0x22, 0), (0, 0x27, 0), (0, 0x2B, 0)]
    for c in range(6):
        init += fm_solta(c)
    patches = [p for _, p in m['vozes']] + [None] * (6 - len(m['vozes']))
    estilo = m.get('estilo', {})
    if len(m['vozes']) < 3:
        patches[2] = 'baixo'
    if estilo.get('acorde'):
        for c in range(3, 6):
            patches[c] = estilo.get('patch_acorde', 'cordas' if estilo.get('acorde') == 'pad' else 'cavaco')
    vol = m.get('volumes', {})
    for c, p in enumerate(patches[:6]):
        if p:
            init += fm_patch(c, p, vol.get(c, 0 if c < 3 else 10))
    init += [(2, 0x9F), (2, 0xBF), (2, 0xDF), (2, 0xFF)]   # PSG calado
    ev = arranjar(m)
    total_q = round(m['tempos'] * seg * QUADROS)
    por_quadro = {}
    for t, pri, cmds in ev:
        q = min(total_q - 1, round(t * seg * QUADROS))
        por_quadro.setdefault(q, []).append((pri, cmds))
    dados = bytearray()
    def emitir(cmds):
        for parte, a, b in [x if len(x) == 3 else (x[0], x[1], None) for x in cmds]:
            if parte == 2:
                dados.extend((2, a))
            else:
                dados.extend((parte, a, b))
    emitir(init)
    dados.append(5)                                      # começo do loop
    ultimo = 0
    for q in sorted(por_quadro):
        while q - ultimo > 0:
            n = min(255, q - ultimo); dados.extend((3, n)); ultimo += n
        for _, cmds in sorted(por_quadro[q], key=lambda x: x[0]):   # solta (0) antes de tocar (1)
            emitir(cmds)
    while total_q - ultimo > 0:
        n = min(255, total_q - ultimo); dados.extend((3, n)); ultimo += n
    for c in range(6):
        emitir(fm_solta(c))
    dados.append(4)                                      # volta pro começo do loop
    return bytes(dados), total_q / QUADROS

def gerar_rom(m, dados):
    toc = (AQUI / 'tocador.bin').read_bytes()
    rom = bytearray(max(0x2000, 0x800 + len(dados) + 0x7FF & ~0x7FF))
    rom[0:4] = (0x00FFFE00).to_bytes(4, 'big')
    for i in range(1, 64):
        rom[i * 4:i * 4 + 4] = (0x200).to_bytes(4, 'big')
    rom[0x100:0x110] = b'SEGA MEGA DRIVE '
    titulo = ('KOFSTATION ' + m['id'].upper()).encode()[:48]
    rom[0x150:0x180] = titulo.ljust(48)
    rom[0x1F0:0x1F3] = b'JUE'
    rom[0x200:0x200 + len(toc)] = toc
    rom[0x800:0x800 + len(dados)] = dados
    return bytes(rom)

# ---------------- as músicas ----------------
air = json.loads((AQUI.parent / 'air.json').read_text())
MUSICAS = [
    dict(id='air', titulo='Air (na corda Sol)', autor='J. S. Bach',
         fonte='Mutopia Project, bach_air_bmv_1068.ly (domínio público)', bpm=air['bpm'], tempos=air['tempos'],
         vozes=[([tuple(n) for n in air['vozes'][0]], 'cordas'), ([tuple(n) for n in air['vozes'][1]], 'piano'),
                ([tuple(n) for n in air['vozes'][2]], 'baixo')],
         volumes={0: 0, 1: 8, 2: 2}),
]

def musica(id, titulo, autor, fonte, bpm, compasso, anacruse, melodia, acordes, estilo, lead, transpor=0, volumes=None, tempos=None):
    notas, t = ler(melodia, transpor)
    MUSICAS.append(dict(id=id, titulo=titulo, autor=autor, fonte=fonte, bpm=bpm, compasso=compasso, anacruse=anacruse,
                        tempos=tempos or math.ceil(t * 2) / 2, vozes=[(notas, lead)], acordes=acordes, estilo=estilo,
                        volumes=volumes or {}))

musica('rua', 'Se Essa Rua Fosse Minha', 'cantiga popular', 'partitura no MuseScore marcada "Domínio público" (arranjo de Daniel Pynkus)',
       72, 2, 1,
       'E5:.5 E5:.5 A5:.5 A5:.5 E5:.5 C5:.5 A4:.5 C5:.5 G5:.5 F5:.5 E5:1 B4:2 E5:.5 E5:.5 '
       'B5:.5 B5:.5 F5:.5 E5:.5 F5:.5 E5:.5 C6:.5 B5:.5 A5:3 E5:.5 E5:.5 '
       'A5:.5 A5:.5 C6:.5 B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 G5:1 F5:2 E5:.5 D5:.5 '
       'E5:1 B5:.5 G#5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:2',
       'Am|Am|E|E|E|E|Am|Am|Am|Am|Dm|Dm|E|E|Am', dict(baixo='marcha', acorde='pad', arpejo=True), 'flauta', transpor=-12)

musica('balao', 'Cai, Cai, Balão', 'cantiga popular', 'partitura para piano no MuseScore (cantiga popular, domínio público)',
       100, 4, 1,
       'G4:1 G4:1 F4:1 E4:1 G4:1 G4:1 F4:1 E4:1 G4:1 A4:1 G4:1 F4:1 E4:1 D4:3 D4:.5 E4:.5 '
       'F4:1 D4:.5 E4:.5 F4:1 D4:.5 E4:.5 F4:2 G4:1 A4:1 G4:1 F4:1 E4:1 D4:1 C4:3',
       'C|C|C|Dm|Dm|F|G|C', dict(baixo='marcha', acorde='stab', patch_acorde='sanfona', chimbal=0.5), 'sanfona', transpor=12)

musica('abrealas', 'Ó Abre-Alas', 'Chiquinha Gonzaga (1899)', 'cifra da Super Partituras (melodia de domínio público)',
       112, 2, 0,
       ('-:.5 C5:.5 C5:.5 B4:.5 B4:.5 A4:1 C5:1 B4:.5 A4:.5 G#4:.5 A4:2 ' * 2)
       + '-:.5 A4:.5 A4:.5 G4:.5 G4:.5 F4:1 A4:1 A4:.5 G4:.5 F4:.5 E4:2 '
       + '-:.5 E4:.5 A4:.5 C5:.5 E5:.5 B4:1 E5:1 D5:.5 C5:.5 B4:.5 A4:2',
       'E7|Am|E7|Am|E7|Am|E7|Am|Am|Dm7|G7|Am|Am|Am|E7|Am', dict(baixo='marcha', acorde='stab', patch_acorde='metais', chimbal=0.5), 'metais')

musica('guarani', 'O Guarani (A Voz do Brasil)', 'Carlos Gomes (1870)', 'cifra da Super Partituras, tema da protofonia (domínio público)',
       80, 4, 0,
       'E5:2 A5:1.5 G5:.25 F5:.25 E5:2 A5:1 -:.5 G5:.25 F5:.25 E5:1 A5:1 A5:1 C6:1 '
       'B5:.25 D6:.25 C6:.5 B5:.25 A5:.25 B5:.5 C6:1 G5:1 '
       'E5:2 A5:1.5 G5:.25 F5:.25 E5:2 A4:1.5 G4:.25 F4:.25 E4:2 E4:1.5 D4:.5 E4:3 G4:1',
       'C Am|C Am|C Am|G7|C Am|C Am|C G7|C', dict(baixo='raiz', acorde='pad'), 'metais')

musica('ticotico', 'Tico-Tico no Fubá', 'Zequinha de Abreu (1917)', 'partitura para violino no MuseScore (arranjo de Patrick Hirte)',
       126, 4, 1.5,
       'E4:.5 D#4:.5 E4:.5 '
       'F4:.5 E4:.5 -:.5 A4:1 E4:.5 D#4:.5 E4:.5 F4:.5 E4:.5 -:.5 G#4:1 E4:.5 D#4:.5 E4:.5 '
       'F4:.5 E4:.5 D5:.5 B4:.5 G#4:.5 E4:.5 D4:.5 C#4:.5 C4:2 -:.5 A4:.5 G#4:.5 G4:.5 '
       'F4:.5 A4:.5 -:.5 D5:1 C5:.5 A4:.5 F4:.5 E4:.5 A4:.5 -:.5 C5:1 C5:.5 B4:.5 A#4:.5 '
       'B4:.5 B3:.5 D#4:.5 F#4:.5 A4:.5 C5:.5 B4:.5 A4:.5 G#4:.5 B4:.5 -:.5 B4:1 E4:.5 D#4:.5 E4:.5 '
       'F4:.5 E4:.5 -:.5 A4:1 E4:.5 D#4:.5 E4:.5 F4:.5 E4:.5 -:.5 G#4:1 E4:.5 D#4:.5 E4:.5 '
       'F4:.5 E4:.5 D5:.5 B4:.5 G#4:.5 E4:.5 D4:.5 C#4:.5 C4:2 -:.5 A4:.5 G#4:.5 G4:.5 '
       'F4:.5 A4:.5 -:.5 D5:1 C5:.5 A4:.5 F4:.5 E4:.5 A4:.5 -:.5 C5:1 C5:.5 B4:.5 A#4:.5 '
       'B4:.5 E4:.5 G#4:.5 B4:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:2 -:.5 B4:.5 A4:.5 G#4:.5 '
       'G4:.5 C4:.5 E4:.5 G4:.5 C4:.5 E4:.5 G4:.5 G#4:.5 A4:1 F4:1 -:.5 B4:.5 A4:.5 G#4:.5 '
       'G4:.5 B3:.5 D4:.5 F4:.5 B3:.5 D4:.5 F4:.5 G4:.5 A4:1 E4:1 -:.5 C5:.5 C5:.5 C5:.5 '
       'C5:.5 B4:.5 B4:.5 B4:1 A4:.5 A4:.5 A4:.5 A4:.5 F4:.5 F4:.5 F4:1 B4:.5 B4:.5 B4:.5 '
       'B4:.5 A4:.5 A4:.5 A4:.5 A4:.5 G4:.5 G4:.5 G4:.5 G4:2 -:.5 B4:.5 A4:.5 G#4:.5 '
       'G4:.5 C4:.5 E4:.5 G4:.5 C4:.5 E4:.5 G4:.5 G#4:.5 A4:1 F4:1 -:.5 B4:.5 A4:.5 G#4:.5 '
       'G4:.5 B3:.5 D4:.5 F4:.5 B3:.5 D4:.5 F4:.5 G4:.5 A4:1 E4:1 -:.5 C5:.5 B4:.5 A#4:.5 '
       'A4:.5 G#4:.5 A4:.5 B4:.5 D5:.5 C5:.5 B4:.5 C5:.5 E5:.5 G4:.5 C5:.5 E5:.5 G5:.5 F#5:.5 F5:.5 E5:.5 '
       'D5:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:.5 E4:.5 -:.5 G4:.5 C5:1 -:.5',
       'Am7|E7|E7|Am7|Dm7|Am7|B7|E7|Am7|E7|E7|Am7|Dm7|Am7|E7|Am7|C|G7|G7|C|Ebdim|Dm7|G7|C|C|G7|G7|C|F F#ø|C A7|Dm7 G7|C',
       dict(baixo='marcha', acorde='stab', patch_acorde='cavaco', chimbal=0.25), 'flauta', transpor=12)

pasta_rom = pathlib.Path(sys.argv[sys.argv.index('--rom') + 1]) if '--rom' in sys.argv else None
saida = {'musicas': []}
for m in MUSICAS:
    dados, seg = gerar_comandos(m)
    saida['musicas'].append({'id': m['id'], 'titulo': m['titulo'], 'autor': m['autor'], 'fonte': m['fonte'],
                             'segundos': round(seg, 2), 'cmd': base64.b64encode(dados).decode()})
    if pasta_rom:
        pasta_rom.mkdir(parents=True, exist_ok=True)
        (pasta_rom / f"kofstation-{m['id']}.md").write_bytes(gerar_rom(m, dados))
    print(f"{m['id']:9} {len(dados):6} bytes  {seg:6.1f} s")
(AQUI.parent / 'trilha.js').write_text(
    '// Gerado por web/musicas/fm/trilha.py: a trilha do KOFstation no som do Mega Drive (comandos pros chips FM e PSG).\n'
    'const KofTrilha = ' + json.dumps(saida, ensure_ascii=False) + ';\n')
