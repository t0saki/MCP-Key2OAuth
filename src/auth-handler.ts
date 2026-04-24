import { Hono } from "hono";
import type { Env } from "./types";
import { extractSlugFromResource } from "./slug";
import { getSlugConfig, createSlug } from "./slug-manager";
import { sha256Short } from "./validation";
import { renderPastePage, renderHomePage } from "./html";

const app = new Hono<{ Bindings: Env }>();

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  const slug = extractSlugFromResource(oauthReqInfo.resource);
  if (!slug) {
    return c.text(
      "Missing or invalid resource parameter. Cannot identify target MCP server.",
      400
    );
  }

  const config = await getSlugConfig(c.env, slug);
  if (!config) {
    return c.text("Unknown MCP server slug.", 404);
  }

  const serialized = btoa(JSON.stringify(oauthReqInfo));
  return c.html(renderPastePage(config, serialized));
});

app.post("/authorize", async (c) => {
  const body = await c.req.parseBody();
  const apiKey = (body["api_key"] as string)?.trim();
  const oauthParamsB64 = body["oauth_params"] as string;

  if (!apiKey) {
    return c.text("API key is required.", 400);
  }
  if (!oauthParamsB64) {
    return c.text("Missing OAuth parameters.", 400);
  }

  let oauthReqInfo: any;
  try {
    oauthReqInfo = JSON.parse(atob(oauthParamsB64));
  } catch {
    return c.text("Invalid OAuth parameters.", 400);
  }

  const slug = extractSlugFromResource(oauthReqInfo.resource);
  if (!slug) {
    return c.text("Invalid resource in OAuth parameters.", 400);
  }

  const config = await getSlugConfig(c.env, slug);
  if (!config) {
    return c.text("Unknown MCP server slug.", 404);
  }

  const keyHash = await sha256Short(apiKey);
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: `${slug}_${keyHash}`,
    metadata: { slug },
    scope: oauthReqInfo.scope || [],
    props: { apiKey, slug },
  });

  return c.redirect(redirectTo);
});

app.post("/api/slugs", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.upstream_url || typeof body.upstream_url !== "string") {
    return c.json({ error: "upstream_url is required" }, 400);
  }

  try {
    const { slug, config } = await createSlug(c.env, {
      upstream_url: body.upstream_url,
      display_name: body.display_name,
      auth_header_name: body.auth_header_name,
      auth_header_prefix: body.auth_header_prefix,
    });

    const origin = new URL(c.req.url).origin;
    return c.json({
      slug,
      mcp_endpoint: `${origin}/${slug}/mcp`,
      display_name: config.display_name,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.html(renderHomePage(origin));
});

export { app as authApp };
