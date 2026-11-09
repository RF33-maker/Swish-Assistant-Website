# Player cut-outs from game photos

Cuts one player out of an action photo as a transparent PNG for the Swish Social cards that need a
figure (the stacked record card, the headline/editorial/duotone styles). Built for photos where players
touch or overlap, which is where every off-the-shelf background remover fails.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python cutout.py photo.jpg out.png --point 600 487 --debug
```

`--point X Y` is a pixel on the player to keep (default: the largest, most central person). The first run
compiles the Vision helper and downloads Segment Anything (`facebook/sam-vit-huge`, about 2.5 GB, into
`~/.cache/huggingface`). A photo takes 15–30 s on an Apple-silicon Mac after that.

## How it works

1. **Masks** — `vision_masks.swift` (macOS Vision, no install) writes a soft mask per person, the
   whole-foreground lift and the person-segmentation class. These edges are soft, and where two players
   touch Vision hands a limb to the wrong person with full confidence (Toluwase's forearm: 0.89 to the
   defender, 0.14 to him), so they are only used as a starting point.
2. **Ownership** — `sam_owner.py` prompts Segment Anything with points on the subject (spread to the
   extremities by farthest-point sampling, otherwise the model hesitates over the arms) and on each other
   person, inside a window around the subject, and gets the subject's whole silhouette back. The model
   is unsure about thin extremities (it dropped Toluwase's fingers on some runs), so every patch of
   foreground next to the mask that it left out gets a second look: a window around the patch at higher
   effective resolution, prompted with points on the owned pixels inside it. Where the silhouette meets
   another person, and wherever the model hesitated or the second look proposed pixels, a graph cut
   (GrabCut on Lab with the chroma doubled, so shadowed red kit and dark skin stop looking alike; pinned
   everywhere else) decides by colour and edges within a few pixels. What the second look proposed must
   pass that cut twice, with colour models learned over the whole region and again in a window around the
   proposal, because a window with points on both sides of a gap tempts the model to bridge it with the
   opponent's arm. The 1px line on the cut, a blend of both people, is given away. A held ball that the model leaves out is re-attached if it is orange and
   solid enough, or round, ball-sized and not a person.
   Without torch installed the fallback is Vision's mask away from other people and GrabCut on colour
   where they are close — that fails when kits match.
3. **Edges** — the boundary against the background is closed-form alpha matting (PyMatting) of the
   foreground lift in a narrow band, which keeps hair and fingers soft; the boundary against another
   person stays hard, anti-aliased by one pixel. Ownership is grown outward where the model is not
   confidently against it, so the matte decides the rim and crevices the lift bridged stay open.
4. **Colours** — semi-transparent rim pixels take the colour of the solid body next to them, weighted by
   their transparency, so no background bleeds in and no colour is invented (un-mixing with an estimated
   background turned red shorts into green fringes). On the hard line against another person the pixel
   keeps its own light and shade but takes the body's hue.

Debug output (`--debug`): `*-own.png` (ownership, red tint = near another person), `*-fgalpha.png`
(the matte of the lift), `*-sam.png` (the model's soft mask) and `*-check.jpg` (dark and grey composites).
`zoom.py` and `contact.py` are for judging edges and batches.

## Limits

- Vision is macOS only; on a server replace `vision_masks.swift` with a person-instance model and a
  salient-object matte (the rest is plain Python).
- A limb hidden behind an opponent stays hidden: the cut-out is the visible part of the player.
- Two players in the same kit still rely on the model's judgement; it is good, not perfect.
- The subject pick without `--point` is "largest and most central", which in a wide shot can be a referee.
