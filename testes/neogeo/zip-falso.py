# Zip FALSO pra testar o Neo Geo sem ter BIOS nem jogo: os nomes e tamanhos de arquivo que o FBNeo espera (lidos do
# d_neogeo.cpp), conteúdo zerado e os 4 últimos bytes ajustados pro CRC32 bater. NÃO é ROM nem BIOS (não roda jogo
# nenhum: a tela fica preta); só testa o caminho zip -> disco virtual -> núcleo, savestate e sonda.
#   python3 testes/neogeo/zip-falso.py <FBNeo>/src/burn/drv/neogeo/d_neogeo.cpp neogeoRomDesc neogeo.zip
#   python3 testes/neogeo/zip-falso.py ... mslugRomDesc mslug.zip    (clone "split": bba2020RomDesc só com o 1º arquivo)
import re, struct, sys, zlib

def dados_com_crc(t, alvo):
    # zeros com os 4 últimos bytes escolhidos pra dar o CRC32 esperado (o CRC é afim nos bits: resolve um sistema 32x32)
    base = zlib.crc32(bytes(t - 4))
    f = lambda x: zlib.crc32(x.to_bytes(4, 'little'), base)
    f0 = f(0); col = [f(1 << i) ^ f0 for i in range(32)]
    linhas = [(col_bits, 1 << i) for i, col_bits in enumerate(col)]   # vetor resultado -> combinação de bits
    alvo ^= f0; x = 0; base_vet = []
    for v, comb in linhas:   # eliminação gaussiana
        for bv, bc in base_vet:
            if v ^ bv < v: v ^= bv; comb ^= bc
        if v: base_vet.append((v, comb)); base_vet.sort(reverse=True)
    for bv, bc in base_vet:
        if alvo ^ bv < alvo: alvo ^= bv; x ^= bc
    assert alvo == 0
    return bytes(t - 4) + x.to_bytes(4, 'little')

fonte, desc, saida = sys.argv[1:4]
src = open(fonte, encoding='latin-1').read()
bloco = src[src.index(f'static struct BurnRomInfo {desc}[]'):]
bloco = bloco[:bloco.index('};')]
arqs = [(n, int(t, 16), int(c, 16)) for n, t, c in re.findall(r'\{\s*"([^"]+)",\s*(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+)', bloco)]
loc, cen, off = bytearray(), bytearray(), 0
out = open(saida, 'wb')
for n, t, c in arqs:
    nb = n.encode()
    h = struct.pack('<IHHHHHIIIHH', 0x04034b50, 10, 0, 0, 0, 0, c, t, t, len(nb), 0) + nb
    out.write(h); out.write(dados_com_crc(t, c))
    cen += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 10, 0, 0, 0, 0, c, t, t, len(nb), 0, 0, 0, 0, 0, off) + nb
    off += len(h) + t
out.write(cen); out.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(arqs), len(arqs), len(cen), off, 0))
out.close()
print(saida, len(arqs), 'arquivos', off // 1024, 'KB')
