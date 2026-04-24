# MCP Key2OAuth

OAuth 2.1 shim for API-key authenticated MCP servers. Wraps any Bearer-token MCP server with OAuth 2.1 so it works with MCP clients that only support OAuth (e.g. claude.ai, Cursor, etc.).

**Demo:** [mcp.767911.xyz](https://mcp.767911.xyz)

## Problem

Many MCP clients (claude.ai web/mobile, Cursor, and others) only support OAuth 2.1 for connecting to remote MCP servers. Meanwhile, most MCP servers use simple API key / Bearer token authentication. There's no way to bridge the two without implementing a full OAuth authorization server on your backend.

## Solution

MCP Key2OAuth is a Cloudflare Worker that sits between your MCP client and server:

- **Facing the MCP client**: presents a standard OAuth 2.1 interface (PKCE, DCR, token refresh)
- **Facing your MCP server**: transparently proxies requests with your API key as a Bearer token

Users provide their API key via a paste page during the OAuth authorization flow. No changes needed to your MCP server backend.

## Quick Start

### 1. Deploy the Worker

#### One-Click Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/t0saki/MCP-Key2OAuth)

Or use the public demo at [mcp.767911.xyz](https://mcp.767911.xyz) to try it out instantly.

#### Manual Deploy

```bash
git clone https://github.com/t0saki/MCP-Key2OAuth.git
cd MCP-Key2OAuth
npm install

# Create KV namespaces
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create SLUG_KV

# Update wrangler.jsonc with the KV namespace IDs from the output above

npx wrangler deploy
```

### 2. Create an Endpoint

Visit your deployed worker URL (or [mcp.767911.xyz](https://mcp.767911.xyz)) and fill in:

- **Upstream MCP Server URL**: your MCP server's endpoint (must be HTTPS)
- **Display Name**: shown to users on the API key paste page

Or use the API:

```bash
curl -X POST https://mcp.767911.xyz/api/slugs \
  -H "Content-Type: application/json" \
  -d '{"upstream_url": "https://your-mcp-server.com/mcp", "display_name": "My MCP Server"}'
```

Response:

```json
{
  "slug": "a3x9k2m7p1q4",
  "mcp_endpoint": "https://mcp.767911.xyz/a3x9k2m7p1q4/mcp",
  "display_name": "My MCP Server"
}
```

### 3. Connect from Your MCP Client

Paste the `mcp_endpoint` URL into any MCP client that supports OAuth:

- **claude.ai**: Add as a custom MCP integration
- **Claude Desktop / Claude Code**: Add as a remote MCP server
- **Cursor**: Add as an MCP server URL
- **Any MCP client with OAuth 2.1 support**

The client will:

1. Discover the OAuth endpoints automatically
2. Open a browser window showing the API key paste page
3. After you paste your key, connect to your MCP server

## How It Works

```
MCP Client ──OAuth 2.1──> Key2OAuth Worker ──Bearer token──> Your MCP Server
                              |
                         Paste page asks
                         user for API key
```

1. MCP client discovers OAuth endpoints via `.well-known` metadata
2. Client redirects user to the `/authorize` page
3. User pastes their API key on the paste page
4. Key2OAuth completes the OAuth flow, encrypting the API key into the OAuth token
5. Client sends MCP requests to the worker with the OAuth token
6. Worker decrypts the API key and proxies requests to the upstream MCP server

## Security Model

**How your API key is handled:**

- Your API key is encrypted at rest using AES-GCM (handled by `@cloudflare/workers-oauth-provider`)
- The key is only decrypted in-memory during request proxying
- Token lifetime matches your API key's lifetime — revoke the key upstream and access stops immediately
- The worker does not maintain a database of plaintext API keys
- The worker operator (whoever deployed it) controls the encryption keys and can technically decrypt tokens

**Only use deployments you trust.** For full control, self-deploy — it takes under 5 minutes.

**What we protect against:** passive eavesdropping, storage leaks, SSRF (upstream URLs validated + `global_fetch_strictly_public` flag)

**What we don't protect against:** a malicious worker operator (they have the encryption keys), vulnerabilities in your upstream MCP server

## Advanced Options

### Custom Auth Headers

If your MCP server uses a non-standard auth header:

```bash
curl -X POST https://mcp.767911.xyz/api/slugs \
  -H "Content-Type: application/json" \
  -d '{
    "upstream_url": "https://your-mcp-server.com/mcp",
    "display_name": "My MCP Server",
    "auth_header_name": "X-API-Key",
    "auth_header_prefix": ""
  }'
```

### Local Development

```bash
npm install
npm run dev
```

This starts a local dev server at `http://localhost:8787` with local KV storage.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **OAuth**: [@cloudflare/workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
- **HTTP**: [Hono](https://hono.dev)
- **Storage**: Cloudflare KV

## License

MIT
