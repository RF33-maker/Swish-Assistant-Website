#!/usr/bin/env python3
"""Contact sheet of cut-outs on a dark ground, each scaled to the same height, labelled by file name.

usage: contact.py OUT.jpg CUTOUT.png [CUTOUT.png …] [--height N] [--bg r,g,b]
"""
import argparse
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("cutouts", nargs="+")
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--bg", default="14,12,17")
    args = ap.parse_args()
    bg = tuple(int(v) for v in args.bg.split(","))

    tiles = []
    for path in args.cutouts:
        cut = Image.open(path).convert("RGBA")
        scale = args.height / cut.size[1]
        cut = cut.resize((max(1, round(cut.size[0] * scale)), args.height), Image.LANCZOS)
        tile = Image.new("RGBA", (cut.size[0] + 40, args.height + 60), bg + (255,))
        tile.alpha_composite(cut, (20, 20))
        ImageDraw.Draw(tile).text((20, args.height + 30), os.path.splitext(os.path.basename(path))[0],
                                  fill=(200, 200, 200, 255))
        tiles.append(tile.convert("RGB"))
    sheet = Image.new("RGB", (sum(t.size[0] for t in tiles), args.height + 60), bg)
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.size[0]
    sheet.save(args.out, quality=90)
    print("wrote", args.out, sheet.size)


if __name__ == "__main__":
    main()
