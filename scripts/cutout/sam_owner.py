"""Who owns the pixels where two people overlap: Segment Anything, prompted from the Vision masks.

Vision's person masks are confidently wrong on a limb that lies across another player (Toluwase's forearm:
0.89 to the defender, 0.14 to him), and colour models fail when the kits match. A promptable segmentation
model sees the whole body, so given points on the subject (positive) and on each other person (negative) it
returns the subject's full silhouette, limbs included. Its edges are coarse (a 256px mask upsampled), which
is why cutout.py only uses it to decide ownership and then refines the boundary.

The positive points matter: centroids alone sit on the torso and the model then hesitates over the arms.
Farthest-point sampling over the subject's confident mask puts points on the extremities (head, shoulder,
feet) as well, and the model follows the limbs from there.

    owner = SamOwner()                       # loads the model once (first run downloads it)
    soft = owner.mask(image_rgb_u8, positives, negatives, crop=(x0, y0, x1, y1))   # float32 HxW in [0, 1]

Model: facebook/sam-vit-huge by default (override with CUTOUT_SAM_MODEL; facebook/sam2.1-hiera-large is
faster and also works). Runs on Apple silicon GPU (MPS) when available, else CPU.
"""
import os
import sys
import time

import cv2
import numpy as np


def _log(*parts):
    print("[sam]", *parts, file=sys.stderr, flush=True)


def _ellipse(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def _pool_points(core, limit=20000, seed=0):
    ys, xs = np.nonzero(core)
    if len(xs) == 0:
        return np.zeros((0, 2), np.float32)
    pts = np.stack([xs, ys], axis=1).astype(np.float32)
    if len(pts) > limit:
        pts = pts[np.random.default_rng(seed).choice(len(pts), size=limit, replace=False)]
    return pts


def kmeans_points(pts, k):
    """k cluster centres snapped onto the nearest pool pixel (a centroid can fall outside a bent limb)."""
    if len(pts) == 0:
        return []
    if len(pts) <= k:
        return [(int(x), int(y)) for x, y in pts]
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, centres = cv2.kmeans(pts, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    out = []
    for c in centres:
        i = int(np.argmin(((pts - c) ** 2).sum(axis=1)))
        out.append((int(pts[i][0]), int(pts[i][1])))
    return out


def farthest_points(pts, k):
    """k points spread as far apart as possible, starting from the one nearest the centroid."""
    if len(pts) == 0:
        return []
    chosen = [int(np.argmin(((pts - pts.mean(axis=0)) ** 2).sum(axis=1)))]
    d = ((pts - pts[chosen[0]]) ** 2).sum(axis=1)
    while len(chosen) < min(k, len(pts)):
        i = int(np.argmax(d))
        chosen.append(i)
        d = np.minimum(d, ((pts - pts[i]) ** 2).sum(axis=1))
    return [(int(pts[i][0]), int(pts[i][1])) for i in chosen]


def prompts_from_masks(subj, others_list, k_mass=3, k_spread=5, k_neg=2, erode_px=6):
    """Positive points on the subject's confident mask (mass + extremities), negatives on each other person."""
    others = np.zeros_like(subj)
    for o in others_list:
        others = np.maximum(others, o)
    for lo, hi in ((0.7, 0.2), (0.5, 0.3), (0.3, 0.5)):
        pool = _pool_points(cv2.erode(((subj >= lo) & (others <= hi)).astype(np.uint8), _ellipse(erode_px)))
        if len(pool) > 200:
            break
    positives = kmeans_points(pool, k_mass)
    for p in farthest_points(pool, k_spread):
        if p not in positives:
            positives.append(p)
    negatives = []
    for o in others_list:
        for lo, hi in ((0.85, 0.1), (0.7, 0.2)):
            pool = _pool_points(cv2.erode(((o >= lo) & (subj <= hi)).astype(np.uint8), _ellipse(8)))
            if len(pool) > 200:
                break
        negatives += kmeans_points(pool, k_neg)
    return positives, negatives


class SamOwner:
    def __init__(self, model_id=None):
        import torch

        self.model_id = model_id or os.environ.get("CUTOUT_SAM_MODEL", "facebook/sam-vit-huge")
        self.is_sam2 = "sam2" in self.model_id.lower()
        t0 = time.time()
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        if self.is_sam2:
            from transformers import Sam2Model, Sam2Processor

            self.processor = Sam2Processor.from_pretrained(self.model_id)
            self.model = Sam2Model.from_pretrained(self.model_id).to(self.device).eval()
        else:
            from transformers import SamModel, SamProcessor

            self.processor = SamProcessor.from_pretrained(self.model_id)
            self.model = SamModel.from_pretrained(self.model_id).to(self.device).eval()
        self.torch = torch
        _log(f"{self.model_id} on {self.device} in {time.time() - t0:.1f}s")

    def mask(self, image_u8, positives, negatives, crop=None):
        """Soft mask (sigmoid of the logits, at image resolution) for the object at the positive points.
        With crop=(x0, y0, x1, y1) the model sees only that window, at higher effective resolution."""
        torch = self.torch
        from PIL import Image

        h, w = image_u8.shape[:2]
        x0, y0, x1, y1 = crop or (0, 0, w, h)
        inside = lambda p: x0 <= p[0] < x1 and y0 <= p[1] < y1
        pos = [(p[0] - x0, p[1] - y0) for p in positives if inside(p)]
        neg = [(p[0] - x0, p[1] - y0) for p in negatives if inside(p)]
        if not pos:
            pos = [(p[0] - x0, p[1] - y0) for p in positives]
        points = [[[[float(x), float(y)] for x, y in pos + neg]]]
        labels = [[[1] * len(pos) + [0] * len(neg)]]
        image = Image.fromarray(np.ascontiguousarray(image_u8[y0:y1, x0:x1]))
        inputs = self.processor(images=image, input_points=points, input_labels=labels, return_tensors="pt")

        def to_dev(v):
            if not hasattr(v, "to"):
                return v
            if v.is_floating_point():
                return v.to(self.device, dtype=torch.float32)  # MPS has no float64
            return v.to(self.device)

        dev = {k: to_dev(v) for k, v in inputs.items()}
        t0 = time.time()
        with torch.no_grad():
            out = self.model(**dev, multimask_output=False)
        if self.is_sam2:
            masks = self.processor.post_process_masks(out.pred_masks.float().cpu(), inputs["original_sizes"],
                                                      binarize=False)
        else:
            masks = self.processor.image_processor.post_process_masks(
                out.pred_masks.float().cpu(), inputs["original_sizes"], inputs["reshaped_input_sizes"],
                binarize=False)
        logits = masks[0][0, 0].numpy().astype(np.float32)
        _log(f"mask in {time.time() - t0:.1f}s, iou score {float(out.iou_scores.flatten()[0]):.2f}, "
             f"{len(pos)}+/{len(neg)}- points, window {x1 - x0}x{y1 - y0}")
        soft = np.zeros((h, w), np.float32)
        soft[y0:y1, x0:x1] = 1.0 / (1.0 + np.exp(-logits))
        return soft
