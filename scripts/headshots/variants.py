"""Web-sized variants of a background-removed headshot.

thumb: a face-framed square for small avatars (head and a little shoulder,
       the same framing whatever the source photo's crop was).
web:   the photo's own framing, capped in size, for banners and cards.
"""
import io
from PIL import Image

THUMB_PX = 192
WEB_MAX = 900

def _rows(alpha, box, step):
    """(y, left, right) of the solid span on sampled rows inside the figure."""
    left, top, right, bottom = box
    px = alpha.load()
    out = []
    for y in range(top, bottom, step):
        xs = [x for x in range(left, right, step) if px[x, y] > 128]
        if xs: out.append((y, xs[0], xs[-1]))
    return out

def head_box(rgba):
    """Square (x0, y0, side) framing the head with some shoulder.

    Works from the cutout's silhouette: the head is the first bulge below
    the top of the figure, the neck the narrowing under it. When the neck
    can't be found (long hair, hoods), head height falls back to a fixed
    share of shoulder width.
    """
    a = rgba.split()[3]
    box = a.getbbox()
    if not box: return None
    left, top, right, bottom = box
    fig_h = bottom - top
    step = max(1, fig_h // 400)
    rows = _rows(a, box, step)
    if len(rows) < 20: return None
    widths = [r - l for _, l, r in rows]
    shoulder = max(widths)
    # Shoulders start where the silhouette first reaches most of its full
    # width; the neck is the narrowest row between the top of the head and
    # there. Searching for the narrowest row (rather than the first dip)
    # copes with big hair, where the widest part of the "head" is the hair.
    s_i = next((i for i, w in enumerate(widths) if w >= 0.85 * shoulder), len(widths) - 1)
    head_h = None
    lo = max(1, int(s_i * 0.25))
    if s_i - lo >= 3:
        neck_i = min(range(lo, s_i), key=lambda i: widths[i])
        if widths[neck_i] < 0.75 * shoulder:
            head_h = rows[neck_i][0] - top
    if head_h is None or not (0.36 * shoulder <= head_h <= 1.0 * shoulder):
        head_h = 0.46 * shoulder
    # Head centre from the top third of the head.
    top_rows = [r for r in rows if r[0] <= top + head_h * 0.35] or rows[:3]
    cx = sum((l + r) / 2 for _, l, r in top_rows) / len(top_rows)
    # Never tighter than most of the shoulder width, so there is always some
    # shoulder in frame and a small avatar reads as a person, not a face crop.
    side = max(head_h * 1.75, shoulder * 0.8)
    return cx - side / 2, top - side * 0.09, side

def make_thumb(rgba):
    hb = head_box(rgba)
    if hb is None:
        hb = (0, 0, min(rgba.size))
    x0, y0, side = hb
    canvas = Image.new("RGBA", (round(side), round(side)), (0, 0, 0, 0))
    canvas.paste(rgba, (round(-x0), round(-y0)), rgba)
    return canvas.resize((THUMB_PX, THUMB_PX), Image.LANCZOS)

def make_web(rgba):
    out = rgba.copy()
    out.thumbnail((WEB_MAX, WEB_MAX), Image.LANCZOS)
    return out

def webp_bytes(img, quality):
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, alpha_quality=90, method=6)
    return buf.getvalue()
