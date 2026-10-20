"""Air ("on the G string"), J. S. Bach, BWV 1068 — partitura de domínio público do Mutopia Project
(bach_air_bmv_1068.ly, flauta e violão, "placed in the public domain by the typesetter"). O .ly vira MIDI no LilyPond
(com o baixo numa pauta própria) e este script tira as notas: desdobra as repetições à mão (o baixo do .ly foi escrito
sem os sinais de repetição) e grava em JSON: vozes = [[início em tempos, duração em tempos, nota MIDI], ...].
Uso: air-midi.py air.midi saida.json"""
import json
import sys

import mido

m = mido.MidiFile(sys.argv[1])
tpb = m.ticks_per_beat
vozes = []
for t in m.tracks[1:]:
    tempo, abertas, notas = 0, {}, []
    for x in t:
        tempo += x.time
        if x.type == 'note_on' and x.velocity > 0:
            abertas.setdefault(x.note, []).append(tempo)
        elif x.type in ('note_off', 'note_on') and x.note in abertas and abertas[x.note]:
            ini = abertas[x.note].pop(0)
            notas.append([ini / tpb, (tempo - ini) / tpb, x.note])
    vozes.append(sorted(notas))
# acordes (o violão de cima): fica só a nota mais aguda de cada ataque (o chip toca uma nota por canal)
for i, v in enumerate(vozes):
    por = {}
    for n in v:
        if n[0] not in por or n[2] > por[n[0]][2]:
            por[n[0]] = n
    vozes[i] = sorted(por.values())
# 19 compassos escritos (5 + casa 1 + casa 2 + 12) -> tocados: 1-5, casa 1, 1-5, casa 2, 8-19, 8-19
ordem = [*range(0, 5), 5, *range(0, 5), 6, *range(7, 19), *range(7, 19)]
saida = []
for v in vozes:
    nv = []
    for k, c in enumerate(ordem):
        for ini, dur, nota in v:
            if c * 4 <= ini < c * 4 + 4:
                nv.append([round(k * 4 + ini - c * 4, 4), round(min(dur, c * 4 + 4 - ini + 4), 4), nota])
    saida.append(nv)
json.dump({'tempos': len(ordem) * 4, 'bpm': 72, 'vozes': saida}, open(sys.argv[2], 'w'), separators=(',', ':'))
print(sys.argv[2], [len(v) for v in saida], 'tempos', len(ordem) * 4)
