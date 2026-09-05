---
name: BCB season and stage navigation
description: How British Championship Basketball competition metadata maps to the two-level public navigation.
---

British Championship Basketball competition rows store both stage and year in `season`, using values such as `Season 2025/26` and `Trophy 2025/26`. Search and league links must open the league-brand hub first. That hub normalizes the shared year into a season dropdown and presents Regular Season and Trophy as competition choices.

**Why:** Redirecting a non-gender brand straight to its newest competition skips the useful selection screen and can land BCB users directly on Trophy. The existing BCB records share a brand but encode stage in the season value.

**How to apply:** Keep new BCB Regular Season and Trophy records under the same competition brand and follow the existing stage-plus-year season naming convention. Multi-competition brand hubs should remain visible rather than auto-redirecting.