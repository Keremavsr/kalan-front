"""Builds the kalan mark from the bundled Bricolage Grotesque subset.

Outputs (all vector, colours from the brand roles):
  src/assets/brand/kalan-symbol.svg      sliced instalment pill, ink
  src/assets/brand/kalan-wordmark.svg    symbol + lowercase "kalan", ink
  src/assets/brand/kalan-app-icon.svg    ink square, ground slices (4 slices)
  src/assets/brand/kalan-app-icon-small.svg  same with 3 slices for 16-32 px
  src/components/brand/logo-paths.ts     path data for the in-app <Logo />
Run: python scripts/brand/make_brand.py   (needs fontTools + brotli)
Then: node scripts/brand/render-icons.mjs  (PNG 16-512 + ICO)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "src/assets/fonts/BricolageGrotesque-sub.woff2"
INK = "#181B26"      # --color-ink
GROUND = "#ECECE6"   # --color-ground

font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": 800, "wdth": 75, "opsz": 96})
gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]


def text_path(text: str, dx: float = 0.0, dy: float = 0.0):
    pen, bounds, x = SVGPathPen(gs), BoundsPen(gs), 0
    for ch in text:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x + dx, dy)))
        gs[name].draw(TransformPen(bounds, (1, 0, 0, -1, x + dx, dy)))
        x += hmtx[name][0]
    return pen.getCommands(), bounds.bounds


def r(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def slices(x0: float, y0: float, h: float, w: float, gap: float, count: int, filled: int, stroke: float):
    """A horizontal pill cut into equal slices. Returns (filled_paths, outlined_paths)."""
    rad = h / 2
    full, outline = [], []
    for i in range(count):
        x = x0 + i * (w + gap)
        first, last = i == 0, i == count - 1
        if i < filled:
            inset, target = 0.0, full
        else:
            inset, target = stroke / 2, outline
        top, bot = y0 + inset, y0 + h - inset
        left, right = x + inset, x + w - inset
        rr = rad - inset
        d = []
        if first:
            d.append(f"M{r(left + rr)} {r(top)}H{r(right)}V{r(bot)}H{r(left + rr)}A{r(rr)} {r(rr)} 0 0 1 {r(left + rr)} {r(top)}Z")
        elif last:
            d.append(f"M{r(left)} {r(top)}H{r(right - rr)}A{r(rr)} {r(rr)} 0 0 1 {r(right - rr)} {r(bot)}H{r(left)}Z")
        else:
            d.append(f"M{r(left)} {r(top)}H{r(right)}V{r(bot)}H{r(left)}Z")
        target.append("".join(d))
    return full, outline


# Symbol geometry in font units. Bar height ~ the x-height so it sits with the lowercase letters.
_, xb = text_path("a")
x_height = -xb[1]
H = round(x_height * 0.44)
STROKE = round(H * 0.15)
SW, GAP = round(H * 1.4), round(H * 0.12)
sym_w = 4 * SW + 3 * GAP

def symbol_svg(fill: str, count=4, filled=2, pad=0.0, size=None, bg=None, radius=0.0, h=H, sw=SW, gap=GAP, stroke=STROKE):
    w = count * sw + (count - 1) * gap
    box_w = size or (w + 2 * pad)
    box_h = size or (h + 2 * pad)
    x0, y0 = (box_w - w) / 2, (box_h - h) / 2
    full, out = slices(x0, y0, h, sw, gap, count, filled, stroke)
    parts = []
    if bg:
        parts.append(f'<rect width="{r(box_w)}" height="{r(box_h)}" rx="{r(radius)}" fill="{bg}"/>')
    parts += [f'<path d="{d}" fill="{fill}"/>' for d in full]
    parts += [f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{r(stroke)}"/>' for d in out]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {r(box_w)} {r(box_h)}">' + "".join(parts) + "</svg>\n", (full, out, box_w, box_h)


out_dir = ROOT / "src/assets/brand"
out_dir.mkdir(parents=True, exist_ok=True)
sym, (sym_full, sym_out, sym_bw, sym_bh) = symbol_svg(INK)
(out_dir / "kalan-symbol.svg").write_text(sym, encoding="utf-8")

# Lockup: symbol left, centred on the x-height, then the word.
gap_word = round(H * 0.9)
word_d, wb = text_path("kalan", dx=sym_w + gap_word, dy=0)
asc = -wb[1]
sym_y = -x_height / 2 - H / 2
full, out = slices(0, sym_y, H, SW, GAP, 4, 2, STROKE)
min_y, max_y = -asc, max(wb[3], sym_y + H)
vb = f"0 {r(min_y)} {r(wb[2])} {r(max_y - min_y)}"
lock = [f'<path d="{word_d}" fill="{INK}"/>'] + [f'<path d="{d}" fill="{INK}"/>' for d in full] + [
    f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{STROKE}"/>' for d in out
]
(out_dir / "kalan-wordmark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">' + "".join(lock) + "</svg>\n", encoding="utf-8"
)

# App icon: ink square, corner radius = --radius-card (14px) at 64px, scaled; ground slices.
ICON = 512
rad = ICON * 14 / 64
ih = ICON * 0.72 / 5.96
icon4, _ = symbol_svg(GROUND, 4, 2, size=ICON, bg=INK, radius=rad, h=ih, sw=ih * 1.4, gap=ih * 0.12, stroke=ih * 0.16)
(out_dir / "kalan-app-icon.svg").write_text(icon4, encoding="utf-8")
ih3 = ICON * 0.8 / 3.6
icon3, _ = symbol_svg(GROUND, 3, 2, size=ICON, bg=INK, radius=rad, h=ih3, sw=ih3 * 1.1, gap=ih3 * 0.15, stroke=ih3 * 0.24)
(out_dir / "kalan-app-icon-small.svg").write_text(icon3, encoding="utf-8")

ts = ROOT / "src/components/brand/logo-paths.ts"
ts.parent.mkdir(parents=True, exist_ok=True)
ts.write_text(
    "// Generated by scripts/brand/make_brand.py from the bundled font subset (weight 800, width 75). Do not edit by hand.\n"
    "// The kalan name and logo are not covered by the MIT licence (see NOTICE).\n"
    f"export const LOGO_VIEWBOX = '{vb}';\n"
    f"export const LOGO_STROKE = {STROKE};\n"
    f"export const LOGO_WORD = '{word_d}';\n"
    f"export const LOGO_PAID = {full!r};\n".replace("'", "'")
    + f"export const LOGO_LEFT = {out!r};\n",
    encoding="utf-8",
)
print("ok", vb, "H", H, "x_height", x_height)
