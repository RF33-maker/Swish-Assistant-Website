---
name: BCB live-feed league alias
description: Why the Genius live parser's BCB Trophy league must remain linked beneath the public season competition.
---

The external live parser resolves the 2026/27 Trophy feed as “BCB Trophy 2027” and writes live schedule, player, and team rows to that feed-specific competition. Keep this record as a hidden child of the public “BCB Trophy 2026-2027” competition rather than deleting it.

**Why:** Deleting or renaming the feed-specific record lets the external poller recreate it. The public league page already aggregates hidden children, so the parent link safely routes live data into the intended season experience.

**How to apply:** When changing BCB competition structure or import cleanup, preserve the feed child’s parent and competition-family links. Treat the public competition and hidden feed descendants as one user-facing family even when public browser access differs between their records. Resolve team logos through the shared server-backed resolver: Trophy schedules can link to stable team records and logo files owned by a different competition, so probing only parent/child storage prefixes is insufficient. A true backend fix would alias the feed name to the intended league before upserts.