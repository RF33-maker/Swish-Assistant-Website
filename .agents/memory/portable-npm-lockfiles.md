---
name: Portable npm lockfiles
description: Keep npm lockfile package sources installable outside the Replit environment.
---

# Portable npm lockfiles

Committed npm lockfiles must not contain `package-firewall.replit.local` tarball URLs. All `resolved` package URLs must use the public npm registry before changes are sent to Vercel.

**Why:** Replit dependency operations can write internal package-firewall URLs into the lockfile. Those hostnames are unavailable to Vercel, causing `npm install` to fail with `ENOTFOUND` before the application build starts.

**How to apply:** After any dependency or lockfile update, search the lockfile for Replit-internal package hosts. Replace contaminated resolved tarball hosts with their equivalent `https://registry.npmjs.org/` URLs while retaining the versions and integrity hashes, then verify the production build.