import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface SlugConfig {
  upstream_url: string;
  auth_header_name: string;
  auth_header_prefix: string;
  display_name: string;
  created_at: number;
}

export interface Env {
  OAUTH_KV: KVNamespace;
  SLUG_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

export interface ProxyProps {
  apiKey: string;
  slug: string;
}
