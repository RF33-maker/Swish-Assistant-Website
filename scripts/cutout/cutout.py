#!/usr/bin/env python3
"""Cut one player out of a game photo.

How it works
  1. Masks (macOS Vision, vision_masks.swift): a soft mask per person, the whole-foreground lift and the
     person-segmentation class. These say which pixels are people and roughly whose they are. Their edges are
     soft, and where two players touch a limb is often handed to the wrong person with full confidence.
  2. Ownership. Segment Anything is prompted with points on the subject (spread to the extremities) and on
     each other person, and returns the subject's whole silhouette, limbs included. Where that silhouette
     meets another person a graph cut snaps its coarse boundary onto the real edge within a narrow band.
     Non-person foreground that touches him (a held ball) is attached. Without the model: Vision's own mask
     away from other people and GrabCut on colour where they are close.
  3. Edges. The boundary against the background comes from closed-form alpha matting of the foreground lift
     (soft hair, fingers); the boundary against another person stays hard, anti-aliased by a pixel.
  4. Colours. Semi-transparent edge pixels take the colour of the solid body next to them, so no background
     colour bleeds into the rim and nothing is invented. Islands dropped, cropped to the opaque bounds.

usage: cutout.py PHOTO OUT.png [--point X Y] [--work DIR] [--debug] [--owner auto|sam|grabcut|vision]
  --point   a pixel on the player to keep (default: the largest, most central person)
  --work    folder for the Vision masks (default: <OUT>-masks); reused when it already holds masks
  --owner   how ownership is settled (default auto: sam when the model is installed, else grabcut/vision)
  --debug   also write the ownership, the two mattes and a check composite next to OUT

Setup: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   (torch, torchvision and
transformers are for sam; its first run downloads facebook/sam-vit-huge, ~2.5 GB, into ~/.cache/huggingface).
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
T0 = time.time()


def log(*parts):
    print(f"[{time.time() - T0:5.1f}s]", *parts, file=sys.stderr, flush=True)


def ellipse(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def u8(mask_bool):
    return mask_bool.astype(np.uint8)


def dil(mask_u8, r):
    return cv2.dilate(mask_u8, ellipse(r))


def ero(mask_u8, r):
    return cv2.erode(mask_u8, ellipse(r))


# ----------------------------------------------------------------------------------------------- masks

def vision_binary():
    src = os.path.join(HERE, "vision_masks.swift")
    build_dir = os.environ.get("CUTOUT_BUILD_DIR") or os.path.join(tempfile.gettempdir(), "swish-cutout")
    binary = os.path.join(build_dir, "vision_masks")
    if not os.path.exists(binary) or os.path.getmtime(binary) < os.path.getmtime(src):
        os.makedirs(build_dir, exist_ok=True)
        log("compiling vision_masks (once) …")
        subprocess.run(["swiftc", "-O", src, "-o", binary], check=True)
    return binary


def run_vision(photo, work):
    if not os.path.exists(os.path.join(work, "masks.json")):
        os.makedirs(work, exist_ok=True)
        subprocess.run([vision_binary(), photo, work], check=True)
    with open(os.path.join(work, "masks.json")) as f:
        return json.load(f)


def load_mask(path, size):
    m = Image.open(path).convert("L")
    if m.size != size:
        m = m.resize(size, Image.BILINEAR)
    return np.asarray(m, dtype=np.float32) / 255.0


def dedupe(persons):
    """Vision sometimes emits a near-empty or duplicated instance: keep one per person."""
    areas = [float((p > 0.5).sum()) for p in persons]
    biggest = max(areas) if areas else 0
    keep = []
    for i, p in enumerate(persons):
        if areas[i] < 0.02 * biggest:
            continue
        dup = False
        for j in keep:
            inter = float(((p > 0.5) & (persons[j] > 0.5)).sum())
            union = areas[i] + areas[j] - inter
            if union and inter / union > 0.8:
                dup = True
                break
        if not dup:
            keep.append(i)
    return keep


def pick_subject(persons, keep, point, shape):
    h, w = shape
    if point is not None:
        x, y = point
        vals = sorted(((persons[i][y, x], i) for i in keep), reverse=True)
        if vals and vals[0][0] >= 0.2:
            return vals[0][1]
    scores = []
    for i in keep:
        ys, xs = np.nonzero(persons[i] > 0.5)
        cx, cy = xs.mean(), ys.mean()
        if point is not None:
            scores.append((-np.hypot(cx - point[0], cy - point[1]), i))
        else:
            off_centre = np.hypot((cx - w / 2) / w, (cy - h / 2) / h)
            scores.append((len(xs) * (1.0 - off_centre), i))
    return max(scores)[1]


def components_touching(mask_u8, touch_u8, min_area=0):
    """The connected components of mask that overlap touch (and are big enough)."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask_u8, connectivity=8)
    keep = np.zeros(n, bool)
    keep[np.unique(labels[touch_u8 > 0])] = True
    keep[0] = False
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            keep[i] = False
    return keep[labels].astype(np.uint8)


def attached_objects(objects_u8, own_u8, others, people, img_u8):
    """Pieces of foreground the model left out that touch the subject and are small enough, close enough and
    either ball-coloured or round enough to be something held, not a hoarding, a chair, or a sliver of an
    opponent's arm. A held ball is often half inside the model's mask, so its remainder is a crescent: the
    colour test is what keeps it."""
    ys, xs = np.nonzero(own_u8)
    if len(xs) == 0:
        return np.zeros_like(own_u8)
    area = float(len(xs))
    bw, bh = xs.max() - xs.min(), ys.max() - ys.min()
    lim = (xs.min() - 0.15 * bw, ys.min() - 0.15 * bh, xs.max() + 0.15 * bw, ys.max() + 0.15 * bh)
    touch = dil(own_u8, 4)
    hsv = cv2.cvtColor(img_u8, cv2.COLOR_RGB2HSV)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(objects_u8, connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, w, h, a = stats[i]
        if a < 0.0005 * area or a > 0.25 * area:
            continue
        if x < lim[0] or y < lim[1] or x + w > lim[2] or y + h > lim[3]:
            continue
        piece = labels == i
        if not (touch[piece] > 0).any():
            continue
        if others[piece].max() >= 0.1:  # Vision thinks someone else is there, even faintly
            continue
        contours, _ = cv2.findContours(u8(piece), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hull_area = cv2.contourArea(cv2.convexHull(max(contours, key=cv2.contourArea))) if contours else 0
        solidity = a / hull_area if hull_area else 0
        aspect = w / h if h else 0
        hue, sat = hsv[piece, 0], hsv[piece, 1]
        # measured: balls have mean saturation 93 (a pale Wilson) to 180, hue 10–40° on 84–95% of pixels;
        # a blurred teammate's beige kit 56, a wooden floor under 90
        orange = sat.mean() >= 80 and ((hue >= 5) & (hue <= 20)).mean() > 0.7
        perimeter = sum(cv2.arcLength(c, True) for c in contours)
        circularity = 4 * np.pi * a / (perimeter * perimeter) if perimeter else 0
        if orange and solidity >= 0.5 and a <= 0.3 * area:  # a ball near the lens is big
            keep[i] = True
        elif (people[piece].mean() < 0.3 and solidity >= 0.8 and circularity >= 0.5 and 0.6 <= aspect <= 1.7
              and a <= 0.1 * area):
            keep[i] = True  # round, not a person, ball-sized: some other ball
    return keep[labels].astype(np.uint8)


def refine_extremities(owner, img_u8, own0, soft, base, others, pos, neg, px, max_tiles=8):
    """A second, closer look at the foreground next to the mask that the model left out (fingers, a foot,
    the far side of a limb). Each such patch gets a window around it at higher effective resolution, with
    points on the owned pixels inside the window as positives and other people's cores as negatives;
    whatever the model adds that touches the body and is not implausibly large is kept, but only as a
    proposal: the graph cut re-decides those pixels by colour and edges later (a window with points on both
    sides of a gap tempts the model to bridge it with the opponent's arm).
    Returns the grown mask, the merged soft map and the proposed pixels."""
    from sam_owner import kmeans_points, _pool_points

    H, W = own0.shape
    reach = int(np.clip(round(0.05 * px), 30, 90))
    cand = u8((base >= 0.5) & (own0 == 0) & (dil(own0, reach) == 1))
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, ellipse(2))
    ys, xs = np.nonzero(cand)
    if len(xs) == 0:
        return own0, soft, np.zeros_like(own0)
    T = int(np.clip(round(0.28 * px), 256, 640))
    step = max(1, int(0.6 * T))
    tiles = {}
    for ty in range(max(0, ys.min() - T // 4), ys.max() + 1, step):
        for tx in range(max(0, xs.min() - T // 4), xs.max() + 1, step):
            x0 = max(0, min(tx, W - T))
            y0 = max(0, min(ty, H - T))
            x1, y1 = min(W, x0 + T), min(H, y0 + T)
            n = int(cand[y0:y1, x0:x1].sum())
            if n >= 0.002 * T * T:
                tiles[(x0, y0, x1, y1)] = n
    tiles = sorted(tiles, key=tiles.get, reverse=True)[:max_tiles]
    own = own0.copy()
    merged = soft.copy()
    area = float(own0.sum())
    for (x0, y0, x1, y1) in tiles:
        inside = lambda p: x0 <= p[0] < x1 and y0 <= p[1] < y1
        sub = (slice(y0, y1), slice(x0, x1))
        own_pts = kmeans_points(_pool_points(ero(own[sub], 6)), 3)
        if not own_pts:
            continue
        p_pos = [(x + x0, y + y0) for x, y in own_pts] + [p for p in pos if inside(p)]
        other_core = ero(u8((others >= 0.9) & (own == 0) & (soft < 0.05)), 8)[sub]
        p_neg = [p for p in neg if inside(p)] + [(x + x0, y + y0) for x, y in kmeans_points(_pool_points(other_core), 2)]
        soft_t = owner.mask(img_u8, p_pos, p_neg, crop=(x0, y0, x1, y1))
        add = u8((soft_t >= 0.5) & (own == 0) & (dil(cand, 3) == 1))
        add = components_touching(add, dil(own, 2))
        added = int(add.sum())
        if added == 0 or added > 0.08 * area:
            log(f"  window ({x0},{y0})-({x1},{y1}): {'nothing' if added == 0 else f'{added}px, too much'} added")
            continue
        own = own | add
        merged = np.maximum(merged, soft_t)
        log(f"  window ({x0},{y0})-({x1},{y1}): added {added}px")
    return own, merged, own & u8(own0 == 0)


# --------------------------------------------------------------------------------------------- matting

def cf_alpha(img_f, trimap):
    """Closed-form matting of the unknown (0.5) pixels; known pixels come back as given."""
    unknown = trimap == 0.5
    if not unknown.any():
        return trimap.astype(np.float32)
    from pymatting import estimate_alpha_cf

    h, w = trimap.shape
    scale = min(1.0, np.sqrt(1.6e6 / (h * w)))
    if scale < 1.0:
        sw, sh = int(round(w * scale)), int(round(h * scale))
        img_s = cv2.resize(img_f, (sw, sh), interpolation=cv2.INTER_AREA)
        tri_s = cv2.resize(trimap, (sw, sh), interpolation=cv2.INTER_AREA)
        tri_s = np.where(tri_s > 0.99, 1.0, np.where(tri_s < 0.01, 0.0, 0.5))
    else:
        img_s, tri_s = img_f, trimap
    log(f"matting {img_s.shape[1]}x{img_s.shape[0]}, unknown {(tri_s == 0.5).mean() * 100:.1f}% …")
    alpha = estimate_alpha_cf(img_s.astype(np.float64), tri_s.astype(np.float64), laplacian_kwargs={"epsilon": 1e-7})
    if scale < 1.0:
        alpha = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LINEAR)
    alpha = np.clip(alpha, 0.0, 1.0).astype(np.float32)
    alpha[trimap == 1.0] = 1.0
    alpha[trimap == 0.0] = 0.0
    return alpha


def band_trimap(hard_u8, r_in, r_out, limit=None):
    """1 inside the eroded mask, 0 outside the dilated mask, 0.5 in between (only where limit, if given)."""
    tri = np.full(hard_u8.shape, 0.5, np.float32)
    tri[ero(hard_u8, r_in) == 1] = 1.0
    tri[dil(hard_u8, r_out) == 0] = 0.0
    if limit is not None:
        tri[~limit] = hard_u8[~limit]
    return tri


def grabcut_image(img_u8):
    """What the graph cut sees: Lab with the chroma doubled and the darks lifted, so a shadowed red short
    and dark warm skin, near neighbours in RGB, sit far apart."""
    lab = cv2.cvtColor(img_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] = 255.0 * (lab[..., 0] / 255.0) ** 0.7
    lab[..., 1:] = 128.0 + 2.0 * (lab[..., 1:] - 128.0)
    return np.clip(lab, 0, 255).astype(np.uint8)


def grabcut(img_u8, init, iters=5):
    gc = init.copy()
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(grabcut_image(img_u8), gc, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    return u8((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD))


def snap_boundary(img_u8, own_hard, band, limit, undecided=None, proposed=None, margin=60):
    """Graph cut that moves a coarse ownership boundary onto the real edge, within `band` px and only inside
    `limit`, and also decides the `undecided` pixels (where the model was unsure: fingers, thin limbs);
    everything else is pinned. Pixels the second look `proposed` must pass this cut twice: once with colour
    models learned over the whole region and once with models learned in a window around the proposal.
    Over the whole figure an opponent's white trim looks like the subject's white shoes; next to his arm
    it does not."""
    init = np.where(own_hard == 1, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    tri = band_trimap(own_hard, band, band, limit)
    init[tri == 1.0] = cv2.GC_FGD
    init[tri == 0.0] = cv2.GC_BGD
    if undecided is not None:
        init[undecided & (own_hard == 1)] = cv2.GC_PR_FGD
        init[undecided & (own_hard == 0)] = cv2.GC_PR_BGD
    pr = (init == cv2.GC_PR_FGD) | (init == cv2.GC_PR_BGD)
    if not pr.any() or not ((init == cv2.GC_FGD).any() and (init == cv2.GC_BGD).any()):
        return own_hard
    result = grabcut(img_u8, init)
    if proposed is None or not proposed.any():
        return result
    h, w = own_hard.shape
    local = result.copy()
    done = np.zeros((h, w), bool)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(u8(proposed), connectivity=8)
    for i in sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA]):
        if done[labels == i].all():
            continue
        x, y, bw, bh = stats[i, :4]
        for m in (margin, 2 * margin, 4 * margin):
            x0, y0, x1, y1 = max(0, x - m), max(0, y - m), min(w, x + bw + m), min(h, y + bh + m)
            win = (slice(y0, y1), slice(x0, x1))
            sub = init[win]
            if (sub == cv2.GC_FGD).any() and (sub == cv2.GC_BGD).any():
                break
        else:
            continue  # nothing to learn from locally: the global answer stands
        res = grabcut(np.ascontiguousarray(img_u8[win]), np.ascontiguousarray(sub))
        sel = proposed[win] & ~done[win]
        local[win][sel] = res[sel]
        done[win] |= sel
    return np.where(proposed, result & local, result).astype(np.uint8)


def colour_ownership(img_u8, subj, others, inside, other_core_r):
    """Fallback without the segmentation model: GrabCut seeded from the Vision masks alone."""
    sure_bg = ero(u8((inside < 0.08) & (subj < 0.05)), 3)
    other_core = ero(u8((others >= 0.9) & (subj <= 0.05)), other_core_r)
    sure_fg = ero(u8((subj >= 0.9) & (others <= 0.1)), 5)
    init = np.where((subj >= 0.5) & (others < subj), cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    init[sure_bg == 1] = cv2.GC_BGD
    init[other_core == 1] = cv2.GC_BGD
    init[sure_fg == 1] = cv2.GC_FGD
    return grabcut(img_u8, init, iters=6)


def fill_colours(img_f, alpha, edge=None):
    """Edge pixels take the colour of the solid body next to them, weighted by how transparent they are.
    `edge` marks opaque pixels on a hard boundary with another person, which are a blend of both: they get
    mostly the body's colour too."""
    solid = alpha >= 0.9
    if edge is not None:
        solid &= ~edge
    solid = solid.astype(np.float32)
    fill = img_f.copy()
    have = solid.copy()
    for sigma in (1.5, 3, 6, 12, 24, 48):
        num = cv2.GaussianBlur(img_f * solid[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(solid, (0, 0), sigma)
        ok = (den > 0.02) & (have < 0.5)
        if ok.any():
            fill[ok] = num[ok] / den[ok][:, None]
            have[ok] = 1
    w = np.clip(alpha, 0.0, 1.0) ** 3
    out = fill * (1 - w[..., None]) + img_f * w[..., None]
    if edge is not None:
        # keep the pixel's own light and shade (the lines that separate fingers) but take the body's hue,
        # so the other person's colour stops tinting the rim
        lum = np.array([0.299, 0.587, 0.114], np.float32)
        li = (img_f[edge] * lum).sum(axis=1, keepdims=True)
        lf = np.maximum((fill[edge] * lum).sum(axis=1, keepdims=True), 1e-3)
        out[edge] = fill[edge] * (li / lf)
    out[solid == 1] = img_f[solid == 1]
    return np.clip(out, 0.0, 1.0)


def despeckle(alpha, min_area):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(u8(alpha > 0.05), connectivity=8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            alpha[labels == i] = 0.0
    return alpha


# ------------------------------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo")
    ap.add_argument("out")
    ap.add_argument("--point", nargs=2, type=int, metavar=("X", "Y"))
    ap.add_argument("--work")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--owner", choices=["auto", "sam", "grabcut", "vision"], default="auto")
    args = ap.parse_args()

    work = args.work or (os.path.splitext(args.out)[0] + "-masks")
    info = run_vision(args.photo, work)

    im = Image.open(args.photo).convert("RGB")
    W, H = im.size
    img_u8 = np.ascontiguousarray(np.asarray(im))
    img_f = img_u8.astype(np.float32) / 255.0
    px = max(W, H)
    r_rim = int(np.clip(round(0.012 * px), 8, 20))   # how far ownership may reach past the lift's edge
    band = int(np.clip(round(0.008 * px), 6, 14))    # how far a coarse boundary may be moved onto the edge
    r_c = int(np.clip(round(0.05 * px), 30, 90))     # how near another person makes a pixel contested

    persons = [load_mask(os.path.join(work, f"person_{n}.png"), (W, H)) for n in info["persons"]]
    if not persons:
        sys.exit("no person found in the photo")
    keep = dedupe(persons)
    subject_idx = pick_subject(persons, keep, args.point, (H, W))
    subj = persons[subject_idx]
    others_list = [persons[i] for i in keep if i != subject_idx]
    others = np.zeros_like(subj)
    for o in others_list:
        others = np.maximum(others, o)
    fg = load_mask(os.path.join(work, "fg.png"), (W, H)) if info["foregrounds"] else np.zeros_like(subj)
    people = load_mask(os.path.join(work, "people.png"), (W, H)) if info.get("people") else np.zeros_like(subj)
    # the foreground lift, backed up by confident person-segmentation where the lift missed a part
    base = np.maximum(fg, np.where(people >= 0.7, people, 0.0))
    log(f"subject = person {info['persons'][subject_idx]} ({len(keep)} people kept of {len(persons)}), "
        f"{(subj > 0.5).mean() * 100:.1f}% of the photo")
    contested = dil(u8(others >= 0.25), r_c).astype(bool) if others.any() else np.zeros_like(subj, bool)

    owner = args.owner if args.owner != "auto" else "sam"
    sam_soft = None
    if owner == "sam":
        try:
            from sam_owner import SamOwner, prompts_from_masks
        except ImportError as e:  # torch / transformers missing
            owner = "grabcut" if contested.any() else "vision"
            log(f"segmentation model unavailable ({e}); owner = {owner}")
    if owner == "sam":
        pos, neg = prompts_from_masks(subj, others_list)
        # the model sees a window around the subject (25% margin), so a small player still gets detail
        ys, xs = np.nonzero(subj >= 0.3)
        mx, my = int(0.25 * (xs.max() - xs.min())), int(0.25 * (ys.max() - ys.min()))
        window = (max(0, xs.min() - mx), max(0, ys.min() - my), min(W, xs.max() + mx + 1), min(H, ys.max() + my + 1))
        log(f"prompting with {len(pos)} positive and {len(neg)} negative points")
        sam = SamOwner()
        sam_soft = sam.mask(img_u8, pos, neg, crop=window)

    # coarse ownership at full size, plus whatever he is holding
    if sam_soft is not None:
        own0 = u8((sam_soft >= 0.5) | ((subj >= 0.9) & (others <= 0.05)))
        own0 = u8(cv2.medianBlur(own0 * 255, 5) > 127)  # SAM 2 logits carry a grid texture
        log("second look at what the model left out next to the body …")
        sam_global = sam_soft
        own0, sam_soft, proposed = refine_extremities(sam, img_u8, own0, sam_soft, base, others, pos, neg, px)
    else:
        own0 = u8(subj >= 0.4)
        proposed = np.zeros_like(own0)
        sam_global = None
    objects = u8((base >= 0.5) & (own0 == 0) & (others < 0.25))
    attached = attached_objects(objects, own0, others, people, img_u8)
    own0 = own0 | attached
    note = ""
    if attached.any():
        ys, xs = np.nonzero(attached)
        note = f", attached object(s) {int(attached.sum())}px in ({xs.min()},{ys.min()})-({xs.max()},{ys.max()})"
    log(f"coarse ownership {own0.mean() * 100:.1f}% of the photo{note}")

    # a region around everything that might be his, so the colour models learn the nearby background only
    region = (own0 > 0) | (subj >= 0.3)
    if owner == "grabcut":
        region |= contested & dil(u8(subj >= 0.3), 2 * r_c).astype(bool)
    ys, xs = np.nonzero(region)
    pad = int(round(0.04 * px))
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    crop = lambda a: np.ascontiguousarray(a[y0:y1, x0:x1])
    img_c, imgf_c = crop(img_u8), crop(img_f)
    subj_c, others_c, base_c, contested_c, own_c0 = crop(subj), crop(others), crop(base), crop(contested), crop(own0)
    log(f"region {x1 - x0}x{y1 - y0} at ({x0},{y0}); contested {contested_c.mean() * 100:.0f}%; owner {owner}")

    # the edge against the background: matte the foreground lift
    tri_fg = np.full(base_c.shape, 0.5, np.float32)
    tri_fg[ero(u8(base_c >= 0.97), 2) == 1] = 1.0  # 2px: a crevice the lift bridged is re-decided
    tri_fg[dil(u8(base_c >= 0.03), 3) == 0] = 0.0
    alpha_fg = cf_alpha(imgf_c, tri_fg)

    # ownership, hard, then anti-aliased
    edge = None
    if owner in ("sam", "grabcut"):
        if owner == "sam":
            sam_c = crop(sam_soft)
            own_hard = own_c0
            # never grow into what the first, whole-body pass confidently gave to someone else (the second
            # look's windows are tempted to bridge a gap; what they add is only ever a proposal)
            allow = crop(sam_global) >= 0.1
            # where the model hesitated (fingers, a thin limb) and what the second look proposed, colour and
            # edges decide, not the 0.5 line
            undecided = (dil(u8((sam_c >= 0.12) & (sam_c <= 0.88)), 3) | dil(crop(proposed), 2)) == 1
        else:
            other_core_r = int(np.clip(round(0.02 * max(y1 - y0, x1 - x0)), 12, 40))
            own_hard = colour_ownership(img_c, subj_c, others_c, base_c, other_core_r) | crop(attached)
            own_hard = np.where(contested_c, own_hard, own_c0).astype(np.uint8)
            allow = np.ones(own_hard.shape, bool)
            undecided = None
        # foreground that is not his and lies on another person (Vision's halo marks where people are)
        other_people = lambda o: u8((base_c >= 0.5) & (o == 0) & (others_c >= 0.15))
        # the graph cut works only at the interface with other people; against the background the matte rules
        iface = (dil(own_hard, band) & dil(other_people(own_hard), band)) == 1
        own_hard = snap_boundary(img_c, own_hard, band, iface, undecided, crop(proposed) == 1,
                                 margin=int(np.clip(0.05 * px, 40, 100)))
        # the cut lands on the colour edge, whose pixels are a blend of both people: give that 1px line away
        own_hard = own_hard & u8(dil(other_people(own_hard), 1) == 0)
        # then grow outward (so the foreground matte decides the edge) except into other people and into
        # what the model confidently excluded (a crevice the lift bridged stays out that way)
        blocked = dil(other_people(own_hard), 2) == 1
        grow = (dil(own_hard, band) == 1) & allow & (others_c < 0.3) & ~blocked
        own_hard = own_hard | u8(grow)
        edge = (dil(other_people(own_hard), 1) == 1) & (own_hard == 1)  # 1px: wider and fingers go flat
        own = cv2.GaussianBlur(own_hard.astype(np.float32), (0, 0), 0.6)
    else:
        own = dil(own_c0, r_rim).astype(np.float32)

    alpha = alpha_fg * own
    core = u8((subj_c >= 0.85) & (others_c <= 0.1))
    main_part = components_touching(u8(alpha >= 0.5), core)
    alpha *= dil(main_part, r_rim)
    alpha = despeckle(alpha, max(40, 0.0003 * alpha.size))
    fgc = fill_colours(imgf_c, alpha, edge)

    full_a = np.zeros((H, W), np.float32)
    full_a[y0:y1, x0:x1] = alpha
    full_rgb = img_f.copy()
    full_rgb[y0:y1, x0:x1] = fgc
    ys, xs = np.nonzero(full_a > 0.002)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([np.round(full_rgb[by0:by1, bx0:bx1] * 255), np.round(full_a[by0:by1, bx0:bx1] * 255)])
    out = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    out.save(args.out)
    log(f"wrote {args.out} {out.size} from bbox ({bx0},{by0})-({bx1},{by1})")

    if args.debug:
        stem = os.path.splitext(args.out)[0]
        vis = (np.dstack([own, own, own]) * 255).astype(np.uint8)
        vis[contested_c, 0] = np.minimum(255, vis[contested_c, 0].astype(int) + 90).astype(np.uint8)
        Image.fromarray(vis).save(stem + "-own.png")
        Image.fromarray((alpha_fg * 255).astype(np.uint8)).save(stem + "-fgalpha.png")
        if sam_soft is not None:
            Image.fromarray((crop(sam_soft) * 255).astype(np.uint8)).save(stem + "-sam.png")
        dark = Image.new("RGBA", out.size, (14, 12, 17, 255))
        dark.alpha_composite(out)
        grey = Image.new("RGBA", out.size, (150, 150, 150, 255))
        grey.alpha_composite(out)
        sheet = Image.new("RGB", (out.size[0] * 2 + 12, out.size[1]), (255, 0, 255))
        sheet.paste(dark.convert("RGB"), (0, 0))
        sheet.paste(grey.convert("RGB"), (out.size[0] + 12, 0))
        sheet.save(stem + "-check.jpg", quality=90)
        log("debug files written next to the output")


if __name__ == "__main__":
    main()
