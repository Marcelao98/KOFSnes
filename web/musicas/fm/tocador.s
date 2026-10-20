| Tocador de música do KOFstation pro Mega Drive (68000). Fica em 0x200 da ROM e lê uma lista de comandos em 0x800:
|   0x00 reg val  escreve no YM2612 (parte I: canais 1-3 e registradores globais)
|   0x01 reg val  escreve no YM2612 (parte II: canais 4-6)
|   0x02 val      escreve no PSG (SN76489)
|   0x03 n        espera n quadros (n >= 1; um quadro = um vblank, 60 por segundo)
|   0x05          marca o começo do loop
|   0x04          volta pro começo do loop
| O 68000 escreve direto no YM2612 pelo barramento do Z80 (pedido e mantido o tempo todo; o Z80 fica parado).
        .text
inicio:
        move.w  #0x2700,%sr
        move.w  #0x8144,0xC00004        | VDP: tela ligada (o vblank marca o tempo)
        move.w  #0x100,0xA11100         | pede o barramento do Z80...
        move.w  #0x100,0xA11200         | ...e solta o reset dele
1:      btst    #0,0xA11100
        bne.s   1b
        lea     0x800,%a0
        movea.l %a0,%a3
proximo:
        moveq   #0,%d0
        move.b  (%a0)+,%d0
        cmp.b   #3,%d0
        beq.s   espera
        cmp.b   #2,%d0
        beq.s   psg
        cmp.b   #4,%d0
        beq.s   volta
        cmp.b   #5,%d0
        beq.s   marca
        lea     0xA04000,%a2            | 0 ou 1: YM2612, parte I ou II
        tst.b   %d0
        beq.s   2f
        addq.l  #2,%a2
2:      btst    #7,0xA04000             | espera o chip ficar livre
        bne.s   2b
        move.b  (%a0)+,(%a2)
3:      btst    #7,0xA04000
        bne.s   3b
        move.b  (%a0)+,1(%a2)
        bra.s   proximo
psg:    move.b  (%a0)+,0xC00011
        bra.s   proximo
marca:  movea.l %a0,%a3
        bra.s   proximo
volta:  movea.l %a3,%a0
        bra.s   proximo
espera: moveq   #0,%d3
        move.b  (%a0)+,%d3
        subq.w  #1,%d3
4:      move.w  0xC00004,%d4            | sai do vblank...
        btst    #3,%d4
        bne.s   4b
5:      move.w  0xC00004,%d4            | ...e espera o próximo
        btst    #3,%d4
        beq.s   5b
        dbf     %d3,4b
        bra     proximo
