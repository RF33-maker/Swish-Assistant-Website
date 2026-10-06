# Headshot tooling

Local scripts for preparing player headshots. They run on your own machine;
nothing is sent to a third-party service.

    python3 -m venv .venv && .venv/bin/pip install "rembg[cpu]" pillow

- `cut.py <source dir> <out dir>` — removes the background from studio photos
  (`BG_MODEL=birefnet-portrait` gives the cleanest hair edges) and crops to the
  site's house framing: head and chest, 1.08 wide to tall, head near the top.
- `variants.py` — builds the two web-sized files every cutout has next to it in
  the `player-photos` bucket: `<name>.thumb.webp` (192px, face-framed, for
  avatars) and `<name>.web.webp` (max 900px, for banners and cards). The site
  reads them through `client/src/components/PlayerHeadshot.tsx` and falls back
  to the original when they are missing.
- `batch_variants.py <paths.json> <out dir>` — runs `variants.py` over a list of
  bucket paths (e.g. every `players.photo_path_bg_removed` in use).

Upload cutouts to a new path per player rather than overwriting an existing
file, then set `players.photo_path_bg_removed` on every record for that player.
The framing rules in `variants.py` are mirrored in
`client/src/lib/headshotVariants.ts`, which builds the same two files in the
browser when an admin uploads a photo through the site; keep the two in step.
