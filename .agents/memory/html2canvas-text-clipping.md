---
name: html2canvas text clipping
description: Reliable typography rules for fixed-size social card exports rendered with html2canvas.
---

Browser text can render differently after html2canvas captures it, especially when the layout clips a bold single-line label.

**Why:** A browser preview looked structurally valid while the exported PNG contained missing horizontal sections in the player-name glyphs.

**How to apply:** When changing exported card typography, inspect the generated PNG at native resolution with representative and unusually wide strings; do not approve it from the browser preview alone.

External SVG image elements can also occupy their expected layout space while rendering invisible in the exported PNG. For critical vector marks, verify the native export; inline SVG has rendered reliably when the equivalent external image did not.