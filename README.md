Sign in to sigrun with an OIDC or OAuth 2 provider. This is for logging in; MCP account connections live in the MCP extension.

# @sigrun/oauth

The `oauth` extension contributes `loginProviders` to sigrun's login seam. Core qualifies them as `login:oauth:<id>`. It supports OIDC discovery with authorization code, PKCE S256, nonce, and full ID-token validation; GitHub and Discord presets; and explicit OAuth 2 endpoints with configurable userinfo field paths.

## Settings

Configure `settings/oauth.json` through sigrun's extension settings surface:

```json
{
  "providers": [
    {
      "id": "company",
      "label": "Company SSO",
      "kind": "oidc",
      "issuer": "https://id.example.com",
      "clientId": "sigrun",
      "scopes": "openid profile email",
      "usernameClaim": "preferred_username",
      "groupsClaim": "groups",
      "autoProvision": false,
      "allowedGroups": ["staff"],
      "allowedDomains": ["example.com"]
    },
    {
      "id": "github",
      "label": "GitHub",
      "kind": "oauth2",
      "preset": "github",
      "clientId": "your-client-id"
    }
  ]
}
```

Set each client secret in the extension secret store under `<id>.clientSecret` (for example, `github.clientSecret`). Never put a client secret in settings. A client ID is public configuration and is required in settings on every provider form, including both OAuth 2 forms.

An OAuth 2 provider may instead declare `authorizeUrl`, `tokenUrl`, and `userinfoUrl`, plus `fields` with a required `subject` and optional `username`, `name`, `email`, `emailVerified`, and `groups` dot-separated field paths. Optional `scopes` default to `openid profile email`. The `policy` fields (`autoProvision`, `allowedGroups`, `allowedDomains`) are reported to core, which enforces them. GitHub email is selected only from the primary, verified entry in `/user/emails`; Discord uses its user `verified` field. Neither preset supplies groups.

Malformed entries are skipped individually with a warning naming the provider. With no valid providers, the extension returns `loginProviders: []`. Production provider endpoints require HTTPS; plain HTTP is limited to loopback URLs for local development and tests.

## Development

```sh
npm install --legacy-peer-deps --ignore-scripts
npm test
npm run typecheck
npm run build
```

`dist/` is committed because git-source extension installs load it directly. Rebuild and commit it with source changes.

Core's types-only contract is currently mapped in `tsconfig.json` to the M3b core worktree's built declaration. This is a development-only coupling; use a registry development dependency after the matching core contract is published. Do not publish this package from that worktree-specific state.
