---
name: Vercel serverless bundling
description: How the Express app is bundled for Vercel deployment — esbuild approach, ESM format, why it's needed.
---

## The Rule
Vercel compiles `api/*.ts` files but does NOT bundle local imports from outside `api/`. Any `import ... from '../server/routes'` fails at runtime with `ERR_MODULE_NOT_FOUND`.

**Fix:** Use esbuild to pre-bundle everything into a single file at build time.

## Setup
- Entry: `api/_source.ts` (underscore prefix → Vercel ignores it as a function, esbuild uses it as source)
- Output: `api/index.js` (Vercel uses this as the function handler)
- Build command in `vercel.json`:
  ```
  vite build && node_modules/.bin/esbuild api/_source.ts --bundle --platform=node --format=esm --packages=external --outfile=api/index.js
  ```
- `vercel.json` functions config: `"api/index.js": { "maxDuration": 60 }`

## Why ESM format (not CJS)
`package.json` has `"type": "module"`. Esbuild must use `--format=esm` to match — otherwise `module.exports` is treated as a global (not a real CommonJS export) and the handler is never exported. With `--format=esm`, the output ends with `export { handler as default }` which Vercel loads correctly via dynamic import.

**Why:** When CJS format is used in an ESM package, `require()` isn't available and the exports shim doesn't work. ESM format + `export default handler` is the correct pattern.

## Handler pattern
```ts
export default async function handler(req, res) {
  await ensureInitialized(); // lazy-init Express app + routes
  return new Promise((resolve, reject) => { ... app(req, res) ... });
}
```
The lazy init runs `registerRoutes(app)` once and caches the promise — prevents re-registering routes on every cold invocation.

## Vercel environment variables required
- `SUPABASE_SERVICE_ROLE_KEY` — server will warn (not crash) if missing
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `SESSION_SECRET` (defaults to "keyboard_cat" if unset)
- `VITE_BACKEND_URL` (optional, Python backend URL)
