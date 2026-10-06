import json, os, sys, urllib.request, io
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
from variants import make_thumb, make_web, webp_bytes
BASE = "https://omkwqpcgttrgvbhcxgqf.supabase.co/storage/v1/object/public/player-photos/"
paths = json.load(open(sys.argv[1])); out = sys.argv[2]
before = after_web = after_thumb = 0; failed = []
for i, p in enumerate(paths):
    try:
        raw = urllib.request.urlopen(BASE + urllib.request.quote(p), timeout=60).read()
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        stem = os.path.splitext(p)[0]
        t = webp_bytes(make_thumb(im), 82); w = webp_bytes(make_web(im), 84)
        for suffix, data in ((".thumb.webp", t), (".web.webp", w)):
            dest = os.path.join(out, stem + suffix); os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "wb").write(data)
        before += len(raw); after_web += len(w); after_thumb += len(t)
    except Exception as e:
        failed.append((p, str(e)))
    if (i + 1) % 20 == 0: print(i + 1, "done", flush=True)
print(f"processed {len(paths)-len(failed)} of {len(paths)}; originals {before/1e6:.1f}MB -> web {after_web/1e6:.2f}MB, thumbs {after_thumb/1e6:.2f}MB")
for f in failed: print("FAILED", f)
