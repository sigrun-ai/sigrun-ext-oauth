# AGENTS.md — sigrun-ext-oauth

Guidance for coding agents working in this repository.

## What this is

OIDC and OAuth 2 login providers for sigrun's `loginProviders` seam. This extension is for interactive login only, not MCP account connections.

## Layout

- `src/index.ts` — async factory reading scoped settings and constructing contributions.
- `src/config.ts` — per-entry validation and defaults; one malformed entry never suppresses others.
- `src/oidc.ts` — discovery, PKCE/nonce, token and ID-token validation.
- `src/oauth2.ts` — authorization-code/PKCE and userinfo field mapping.
- `src/presets.ts` — pinned GitHub and Discord endpoints.
- `test/` — vitest suites and a signed in-test issuer.
- `dist/` — committed build output; rebuild with every source change.

## Run and test

```sh
npm install --legacy-peer-deps --ignore-scripts
npm test
npm run typecheck
npm run build
```

Use the legacy-peer install mode so npm does not auto-install the host core peer. Core's types are resolved by the `tsconfig.json` path mapping to the M3b worktree's built declaration; this is DEV-only and must become a registry development dependency when the matching core contract is published. Do not commit `node_modules`.

## Security invariants

- Never weaken issuer, audience, nonce, signature, or expiry checks to make a test pass.
- Client secrets come only from `<id>.clientSecret` in the extension secret store. Never log a secret, access token, or ID token.
- Client IDs belong in settings and are required on every provider form.
- `emailVerified` comes only from `email_verified` or the configured/preset verification field.
- Production endpoints require HTTPS; the in-test HTTPS-to-loopback transport is test code, not a production bypass.

## Conventions

- **Commit dist** with source changes; git-source installs load `dist/index.js` directly.
- Verify `npm test`, `npm run typecheck`, and `npm run build` before completion.
- Tests use synthetic hosts and no real tokens or private URLs.
