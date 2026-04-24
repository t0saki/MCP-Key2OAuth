import type { SlugConfig } from "./types";

const COMMON_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0;
    min-height: 100vh; display: flex; justify-content: center; align-items: center;
    padding: 1rem;
  }
  .card {
    background: #1e293b; border: 1px solid #334155; border-radius: 12px;
    padding: 2rem; max-width: 480px; width: 100%;
  }
  h1 { font-size: 1.25rem; margin-bottom: 0.25rem; color: #f8fafc; }
  .subtitle { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; }
  label { display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.375rem; }
  input, textarea {
    width: 100%; padding: 0.625rem 0.75rem;
    background: #0f172a; border: 1px solid #475569; border-radius: 6px;
    color: #f1f5f9; font-size: 0.875rem; font-family: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: #3b82f6; }
  .field { margin-bottom: 1rem; }
  button {
    width: 100%; padding: 0.75rem; background: #3b82f6; color: white;
    border: none; border-radius: 6px; font-size: 0.9rem; font-weight: 500;
    cursor: pointer; transition: background 0.15s;
  }
  button:hover { background: #2563eb; }
  .disclosure {
    margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #334155;
    font-size: 0.75rem; color: #64748b; line-height: 1.5;
  }
  .badge {
    display: inline-block; background: #1e3a5f; color: #60a5fa;
    padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem;
  }
  .error { color: #f87171; font-size: 0.85rem; margin-bottom: 1rem; }
`;

export function renderPastePage(
  config: SlugConfig,
  oauthParamsBase64: string
): string {
  const upstreamHost = new URL(config.upstream_url).hostname;
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to ${escapeHtml(config.display_name)}</title>
<style>${COMMON_STYLES}</style>
</head><body>
<div class="card">
  <h1>Connect to ${escapeHtml(config.display_name)}</h1>
  <p class="subtitle">Upstream: <span class="badge">${escapeHtml(upstreamHost)}</span></p>
  <form method="POST" action="/authorize">
    <div class="field">
      <label for="api_key">API Key</label>
      <textarea id="api_key" name="api_key" rows="3" required
        placeholder="Paste your API key here"></textarea>
    </div>
    <input type="hidden" name="oauth_params" value="${escapeHtml(oauthParamsBase64)}">
    <button type="submit">Authorize</button>
  </form>
  <div class="disclosure">
    <strong>How your API key is handled:</strong><br>
    Your key is encrypted and stored within the OAuth token. Its lifetime matches the key itself &mdash;
    revoke the key upstream and access stops immediately.
    The worker operator can technically decrypt tokens. Only use deployments you trust.
    For full control, <a href="https://github.com/anthropics/mcp-key2oauth" style="color:#60a5fa">self-deploy</a>.
  </div>
</div>
</body></html>`;
}

export function renderHomePage(origin: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCP Key2OAuth</title>
<style>${COMMON_STYLES}
  .result { display:none; margin-top:1rem; padding:1rem; background:#0f172a; border:1px solid #334155; border-radius:6px; }
  .result.visible { display:block; }
  .result code { word-break:break-all; color:#34d399; font-size:0.85rem; }
  .toggle { margin-bottom:1rem; }
  .toggle summary { cursor:pointer; color:#94a3b8; font-size:0.85rem; }
  .toggle-content { margin-top:0.75rem; }
  h2 { font-size: 1rem; color: #94a3b8; font-weight: 400; margin-bottom: 1.5rem; }
</style>
</head><body>
<div class="card">
  <h1>MCP Key2OAuth</h1>
  <h2>Wrap any API-key MCP server with OAuth 2.1</h2>
  <form id="createForm">
    <div class="field">
      <label for="upstream_url">Upstream MCP Server URL</label>
      <input id="upstream_url" name="upstream_url" type="url" required
        placeholder="https://your-mcp-server.example.com/mcp">
    </div>
    <div class="field">
      <label for="display_name">Display Name (optional)</label>
      <input id="display_name" name="display_name" type="text"
        placeholder="My MCP Server">
    </div>
    <details class="toggle">
      <summary>Advanced options</summary>
      <div class="toggle-content">
        <div class="field">
          <label for="auth_header_name">Auth Header Name</label>
          <input id="auth_header_name" name="auth_header_name" type="text"
            placeholder="Authorization" value="Authorization">
        </div>
        <div class="field">
          <label for="auth_header_prefix">Auth Header Prefix</label>
          <input id="auth_header_prefix" name="auth_header_prefix" type="text"
            placeholder="Bearer " value="Bearer ">
        </div>
      </div>
    </details>
    <div id="error" class="error" style="display:none"></div>
    <button type="submit">Create Endpoint</button>
  </form>
  <div id="result" class="result">
    <label>Your MCP Endpoint (paste this into Claude):</label>
    <code id="endpoint"></code>
  </div>
  <div class="disclosure">
    MCP Key2OAuth is an open-source OAuth 2.1 shim. It wraps API-key authenticated MCP servers
    so they work with claude.ai web and mobile. Your API key is encrypted within the OAuth token
    and never stored in plaintext. <a href="https://github.com/anthropics/mcp-key2oauth" style="color:#60a5fa">GitHub</a>
  </div>
</div>
<script>
document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('error');
  err.style.display = 'none';
  const body = {
    upstream_url: document.getElementById('upstream_url').value,
    display_name: document.getElementById('display_name').value || undefined,
    auth_header_name: document.getElementById('auth_header_name').value || undefined,
    auth_header_prefix: document.getElementById('auth_header_prefix').value,
  };
  try {
    const res = await fetch('/api/slugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Failed'; err.style.display='block'; return; }
    document.getElementById('endpoint').textContent = data.mcp_endpoint;
    document.getElementById('result').classList.add('visible');
  } catch(e) { err.textContent = 'Network error'; err.style.display='block'; }
});
</script>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
