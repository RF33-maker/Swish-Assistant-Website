#!/usr/bin/env python3
"""Zoomed crops of a cut-out over a dark ground, side by side, to judge its edges.

usage: zoom.py CUTOUT.png OUT.png x0,y0,x1,y1 [x0,y0,x1,y1 …] [--scale N] [--bg r,g,b]
                [--photo PHOTO.jpg --offset X,Y]
Regions are in the cut-out's own pixel coordinates. With --photo, the matching crop of the original photo
(cut-out origin at --offset in photo coordinates, printed by cutout.py as the bbox) is shown above each tile.
"""
import argparse

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cutout")
    ap.add_argument("out")
    ap.add_argument("regions", nargs="+")
    ap.add_argument("--scale", type=int, default=3)
    ap.add_argument("--bg", default="14,12,17")
    ap.add_argument("--photo")
    ap.add_argument("--offset", default="0,0")
    args = ap.parse_args()

    cut = Image.open(args.cutout).convert("RGBA")
    bg = tuple(int(v) for v in args.bg.split(","))
    ground = Image.new("RGBA", cut.size, bg + (255,))
    ground.alpha_composite(cut)
    ground = ground.convert("RGB")
    photo = Image.open(args.photo).convert("RGB") if args.photo else None
    ox, oy = (int(v) for v in args.offset.split(","))

    def up(tile):
        return tile.resize((tile.size[0] * args.scale, tile.size[1] * args.scale), Image.LANCZOS)

    tiles = []
    for spec in args.regions:
        x0, y0, x1, y1 = (int(v) for v in spec.split(","))
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(cut.size[0], x1), min(cut.size[1], y1)
        tile = up(ground.crop((x0, y0, x1, y1)))
        if photo is not None:
            ref = up(photo.crop((x0 + ox, y0 + oy, x1 + ox, y1 + oy)))
            both = Image.new("RGB", (tile.size[0], tile.size[1] * 2 + 8), (255, 0, 255))
            both.paste(ref, (0, 0))
            both.paste(tile, (0, ref.size[1] + 8))
            tile = both
        tiles.append(tile)
    gap = 16
    sheet = Image.new("RGB", (sum(t.size[0] for t in tiles) + gap * (len(tiles) - 1), max(t.size[1] for t in tiles)),
                      (255, 0, 255))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.size[0] + gap
    if args.out.lower().endswith((".jpg", ".jpeg")):
        sheet.save(args.out, quality=95, subsampling=0)
    else:
        sheet.save(args.out)
    print("wrote", args.out, sheet.size)


if __name__ == "__main__":
    main()
