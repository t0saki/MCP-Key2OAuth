# MCP-Key2OAuth Implementation Plan

## Context

claude.ai web/mobile only supports OAuth 2.1 for connecting to remote MCP servers. Many MCP servers use simple API key / Bearer token auth. No existing open-source tool bridges this gap as a serverless middle layer.

MCP-Key2OAuth is a Cloudflare Worker that acts as an OAuth 2.1 shim: it presents an OAuth interface to Claude clients, and transparently proxies requests to upstream MCP servers with the user's API key injected as a Bearer token (or custom header). Users provide their API key via a paste page during the OAuth flow.

## Core Architecture

### Library: `@cloudflare/workers-oauth-provider` v0.4.0

Handles all OAuth 2.1 protocol details automatically:
- Well-known endpoints (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/{path}`)
- Token endpoint (`/token`) — authorization code exchange, refresh, PKCE validation
- DCR endpoint (`/register`) — dynamic client registration
- CORS headers
- Token validation on API routes, decrypting `ctx.props` for the handler

We provide two handlers:
- `defaultHandler` (Hono app): renders the API key paste page at `/authorize`
- `apiHandler`: proxies authenticated requests to upstream MCP servers

### Per-Request OAuthProvider Pattern

Each slug has its own MCP endpoint path (`/{slug}/mcp`). The library needs `apiRoute` to match this path for token validation. Since slugs are dynamic, we instantiate `OAuthProvider` per-request with the correct `apiRoute`. The constructor is pure (no I/O), so overhead is negligible.

### Request Flow

```
1. Claude POST /{slug}/mcp (no token)
2. Library returns 401 + WWW-Authenticate → resource_metadata URL
3. Claude GET /.well-known/oauth-protected-resource/{slug}/mcp
4. Library auto-serves: { resource: "https://worker/{slug}/mcp", authorization_servers: ["https://worker"] }
5. Claude GET /.well-known/oauth-authorization-server
6. Library auto-serves AS metadata (authorize, token, register endpoints)
7. Claude POST /register (DCR) — library handles automatically
8. Claude opens browser → /authorize?resource=https://worker/{slug}/mcp&...
9. Our Hono app extracts slug from resource param, renders paste page
10. User pastes API key → POST /authorize
11. We call completeAuthorization({ props: { apiKey, slug } })
12. Claude exchanges code at POST /token — library handles
13. Claude sends MCP requests to /{slug}/mcp with Bearer token
14. Library validates token, decrypts ctx.props → { apiKey, slug }
15. Our proxy handler fetches slug config, forwards to upstream with API key
```

### Slug Model

- **Anonymous creation**: anyone can create a slug, no auth required
- **Random IDs**: 12-char random alphanumeric (e.g. `a3x9k2m7p1q4`) to prevent enumeration
- **Immutable**: no update/delete — need a change? create a new slug
- **No listing**: no public endpoint to enumerate existing slugs

### Storage

- `OAUTH_KV` — used by the OAuth library (clients, grants, tokens). Shared across all slugs.
- `SLUG_KV` — our slug configurations. Key: `slug:{id}`, Value: `SlugConfig` JSON.

### Key Security Properties

- API key is encrypted at rest in OAuth grants (library uses AES-GCM, key derived from token)
- API key only decrypted in-memory during proxy requests
- No persistent plaintext storage of API keys
- Token lifetime = API key lifetime (configured as 1 year, but key revocation upstream = immediate invalidation)
- SSRF mitigated by `global_fetch_strictly_public` CF flag + URL validation at creation
- userId scoped as `{slug}:{keyHash}` to prevent cross-slug token reuse

## File Structure

```
src/
  index.ts           — Entry point, slug routing, per-request OAuthProvider
  types.ts           — TypeScript type definitions
  slug.ts            — Slug extraction from URLs and resource params
  proxy-handler.ts   — Proxies authenticated requests to upstream
  auth-handler.ts    — Hono app: /authorize paste page + slug management API
  slug-manager.ts    — CRUD for slug configs in SLUG_KV
  html.ts            — HTML templates (paste page, management page)
  validation.ts      — URL validation, SSRF checks
wrangler.jsonc
package.json
tsconfig.json
README.md
```

## Implementation Steps

### Step 1: Project Scaffolding

Create `package.json`, `tsconfig.json`, `wrangler.jsonc`.

Dependencies: `@cloudflare/workers-oauth-provider`, `hono`
Dev: `wrangler`, `typescript`, `@cloudflare/workers-types`

`wrangler.jsonc`:
- compatibility_flags: `["nodejs_compat"]`
- KV: `OAUTH_KV`, `SLUG_KV`

### Step 2: Types (`src/types.ts`)

```ts
export interface SlugConfig {
  upstream_url: string;
  auth_header_name: string;     // "Authorization"
  auth_header_prefix: string;   // "Bearer "
  display_name: string;
  created_at: number;
}

export interface Env {
  OAUTH_KV: KVNamespace;
  SLUG_KV: KVNamespace;
}

export interface ProxyProps {
  apiKey: string;
  slug: string;
}
```

### Step 3: Utilities (`src/slug.ts`, `src/validation.ts`)

`slug.ts`:
- `extractSlugFromPath(pathname)` — `/{slug}/mcp` → slug
- `extractSlugFromResource(resource)` — `https://host/{slug}/mcp` → slug
- URL parsing, null-safe

`validation.ts`:
- `validateUpstreamUrl(url)` — HTTPS required, no private hostnames
- `generateSlugId()` — 12-char crypto random alphanumeric

### Step 4: Slug Manager (`src/slug-manager.ts`)

- `getSlugConfig(env, slug)` — KV get
- `createSlug(env, params)` — validate URL, generate random ID, store config, return `{ slug, mcp_endpoint }`

### Step 5: HTML Templates (`src/html.ts`)

- `renderPastePage(config, oauthParams)` — clean form: display name, upstream host hint, API key textarea, submit button. Hidden field with base64-encoded OAuth request params. Clear disclosure about key handling.
- `renderHomePage()` — slug creation form: upstream URL, display name, optional header config. Submit creates slug via API.

Inline CSS, no external deps. Disclosure text: "Your API key is encrypted and stored with the same lifecycle as the key itself. If you revoke the key upstream, access stops immediately. For full control, self-deploy this worker."

### Step 6: Auth Handler (`src/auth-handler.ts`)

Hono app serving as `defaultHandler`:

**GET /authorize** — parse OAuth request via `env.OAUTH_PROVIDER.parseAuthRequest()`, extract slug from `resource` param, load slug config, render paste page.

**POST /authorize** — read API key from form body, deserialize OAuth params from hidden field, call `env.OAUTH_PROVIDER.completeAuthorization({ request: oauthReq, userId: "{slug}:{keyHash}", props: { apiKey, slug }, scope: oauthReq.scope, metadata: {} })`, redirect to `redirectTo`.

**POST /api/slugs** — anonymous slug creation. Body: `{ upstream_url, display_name?, auth_header_name?, auth_header_prefix? }`. Returns `{ slug, mcp_endpoint }`.

**GET /** — home page with creation form + docs.

### Step 7: Proxy Handler (`src/proxy-handler.ts`)

Plain object with `fetch` method, used as `apiHandler`:

1. Read `ctx.props` → `{ apiKey, slug }`
2. Load slug config from KV
3. Build upstream URL (preserve sub-paths after `/{slug}/mcp`)
4. Clone headers, set `config.auth_header_name` to `config.auth_header_prefix + apiKey`
5. Remove OAuth `Authorization` header
6. Forward request with streaming body (`duplex: 'half'`)
7. Return `new Response(upstream.body, { status, headers })` — stream response (critical for SSE)

### Step 8: Entry Point (`src/index.ts`)

```ts
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Determine apiRoute dynamically
    let apiRoute = '/__internal_no_match__';
    const slug = extractSlugFromPath(url.pathname);
    if (slug) {
      const config = await env.SLUG_KV.get(`slug:${slug}`, 'json');
      if (config) apiRoute = `/${slug}/mcp`;
    }
    
    const provider = new OAuthProvider({
      apiRoute,
      apiHandler: proxyHandler,
      defaultHandler: authApp,
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      accessTokenTTL: 86400 * 365,
      refreshTokenTTL: 86400 * 365,
    });
    
    return provider.fetch(request, env, ctx);
  }
};
```

### Step 9: README.md

- What this is and why it exists
- Quick start (wrangler deploy)
- Creating a slug (curl example)
- Connecting from claude.ai (paste the MCP endpoint URL)
- Security model disclosure
- Self-deployment instructions

## Verification Plan

1. `wrangler dev` — start local dev server
2. Create a slug via `POST /api/slugs` with a test upstream MCP URL
3. Use MCP Inspector to connect to `http://localhost:8787/{slug}/mcp`, verify OAuth flow works
4. Test with claude.ai web: add custom MCP connector pointing to deployed worker URL
5. Verify SSE streaming works (MCP tool calls that return streamed responses)
6. Verify invalid API key → upstream 401 → propagated to Claude
7. Verify random slug IDs are not enumerable

## Known Limitations (v1)

- Client Secret method not supported (library doesn't expose client_secret to tokenExchangeCallback)
- No API key validation at paste time (deferred to v2)
- No rate limiting on slug creation (random IDs + no enumeration mitigates abuse)
- KV eventual consistency means newly created slugs may 404 for a few seconds globally
