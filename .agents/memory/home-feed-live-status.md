---
name: Home feed live status
description: Why home-page live-game priority must validate both status and scheduled tip-off time.
---

Treat a game as currently live only when it has an explicit live/in-progress period status and its scheduled tip-off is within a reasonable current window (currently 12 hours before to 6 hours after now).

**Why:** Historical schedule rows can remain marked `live` for months after the game ended. Trusting status alone caused old competitions and performances to outrank genuinely recent BCB Trophy games.

**How to apply:** Any landing-page or activity feed that promotes live games must combine normalized status with a time-proximity check. Hidden parser competitions must still resolve to their nearest public ancestor for display and branding.