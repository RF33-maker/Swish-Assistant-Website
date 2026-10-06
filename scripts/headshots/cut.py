import sys, os
from PIL import Image, ImageFilter
from rembg import remove, new_session

MODEL = os.environ.get("BG_MODEL", "isnet-general-use")
session = new_session(MODEL)

def cutout(path):
    """Background-removed RGBA at the source resolution."""
    rgba = remove(Image.open(path).convert("RGB"), session=session)
    # Trim one pixel off the edge so no sliver of the white studio backdrop survives as a fringe.
    r, g, b, a = rgba.split()
    a = a.filter(ImageFilter.MinFilter(3))
    return Image.merge("RGBA", (r, g, b, a))

def frame(rgba):
    """Crop to the site's house style: head-and-chest, 1.08 wide:tall, head ~17% from the top."""
    a = rgba.split()[3]
    left, top, right, bottom = a.getbbox()
    body_h = bottom - top
    px = a.load()
    # Head centre: mean x of solid pixels in the top 6% of the figure.
    xs = [x for y in range(top, top + max(4, int(body_h * 0.06))) for x in range(left, right) if px[x, y] > 128]
    cx = sum(xs) / len(xs)
    # Shoulder width: widest solid row in the top 30% of the figure (arms crossed lower down are ignored).
    width = 0
    for y in range(top, top + int(body_h * 0.30), 2):
        row = [x for x in range(left, right) if px[x, y] > 128]
        if row: width = max(width, row[-1] - row[0])
    W = width / 0.72
    H = W / 1.08
    x0 = cx - W / 2
    y0 = top - H * 0.167
    canvas = Image.new("RGBA", (round(W), round(H)), (0, 0, 0, 0))
    canvas.paste(rgba, (round(-x0), round(-y0)), rgba)
    return canvas

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    names = sys.argv[3:] or sorted(f for f in os.listdir(src) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    for name in names:
        rgba = cutout(os.path.join(src, name))
        framed = frame(rgba)
        dest = os.path.join(out, os.path.splitext(name)[0] + ".png")
        framed.save(dest)
        print(name, "->", framed.size)
