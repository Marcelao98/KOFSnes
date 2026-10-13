"""Desenha o ícone do KOFnes (xícara de cappuccino) em .ico e .png."""
import sys
from PIL import Image, ImageDraw

def xicara(n):
    s = n / 64.0
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    mocha, latte, espuma, caramelo, espresso = (111, 78, 55), (217, 185, 155), (243, 229, 208), (192, 133, 82), (43, 29, 20)
    d.rounded_rectangle([1 * s, 1 * s, 63 * s, 63 * s], radius=12 * s, fill=espresso)
    d.ellipse([5 * s, 49 * s, 59 * s, 60 * s], fill=mocha)
    d.ellipse([39 * s, 23 * s, 59 * s, 43 * s], outline=latte, width=max(1, int(5 * s)))
    d.rounded_rectangle([9 * s, 18 * s, 47 * s, 55 * s], radius=14 * s, fill=latte)
    d.rectangle([9 * s, 18 * s, 47 * s, 32 * s], fill=latte)
    d.ellipse([9 * s, 12 * s, 47 * s, 24 * s], fill=espuma)
    d.ellipse([12 * s, 14 * s, 44 * s, 22 * s], fill=caramelo)
    # coração de espuma
    d.ellipse([22 * s, 14.5 * s, 28.5 * s, 19 * s], fill=espuma)
    d.ellipse([27.5 * s, 14.5 * s, 34 * s, 19 * s], fill=espuma)
    d.polygon([(22.3 * s, 17.5 * s), (33.7 * s, 17.5 * s), (28 * s, 21.5 * s)], fill=espuma)
    return im

out = sys.argv[1] if len(sys.argv) > 1 else "."
big = xicara(256)
big.save(f"{out}/icone.png")
big.save(f"{out}/icone.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
