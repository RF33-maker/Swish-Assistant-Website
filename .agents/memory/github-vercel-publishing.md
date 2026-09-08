---
name: GitHub and Vercel publishing
description: Durable publishing behavior for this project’s authenticated GitHub and linked Vercel integrations.
---

When publishing from the workspace, treat the authenticated GitHub branch ref as authoritative rather than assuming the local origin/main pointer is current. The linked Vercel project automatically creates a production deployment when the GitHub main ref advances.

**Why:** The remote branch can receive commits that are not present in the local Git fetch, and Vercel’s Git integration is already the deployment path. Updating from a stale local base risks overwriting newer work or creating a duplicate deployment.

**How to apply:** Read the live GitHub main ref through the authorized integration, build the published tree on that parent while preserving remote-only paths, verify the resulting commit ref, and monitor the linked Vercel production deployment to READY before reporting success.