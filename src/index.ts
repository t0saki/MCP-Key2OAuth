import OAuthProvider from "@cloudflare/workers-oauth-provider";
import type { Env } from "./types";
import { extractSlugFromPath } from "./slug";
import { proxyHandler } from "./proxy-handler";
import { authApp } from "./auth-handler";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    let apiRoute = "/__internal_no_match_sentinel__";
    const slug = extractSlugFromPath(url.pathname);
    if (slug) {
      const config = await env.SLUG_KV.get(`slug:${slug}`, "json");
      if (config) {
        apiRoute = `/${slug}/mcp`;
      }
    }

    const provider = new OAuthProvider({
      apiRoute,
      apiHandler: proxyHandler,
      defaultHandler: authApp,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      accessTokenTTL: 86400 * 365,
      refreshTokenTTL: 86400 * 365,
    });

    return provider.fetch(request, env, ctx);
  },
};
