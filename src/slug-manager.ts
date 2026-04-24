import type { Env, SlugConfig } from "./types";
import { validateUpstreamUrl, generateSlugId } from "./validation";

export async function getSlugConfig(
  env: Env,
  slug: string
): Promise<SlugConfig | null> {
  return env.SLUG_KV.get<SlugConfig>(`slug:${slug}`, "json");
}

export interface CreateSlugParams {
  upstream_url: string;
  display_name?: string;
  auth_header_name?: string;
  auth_header_prefix?: string;
}

export async function createSlug(
  env: Env,
  params: CreateSlugParams
): Promise<{ slug: string; config: SlugConfig }> {
  const validation = validateUpstreamUrl(params.upstream_url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const slug = generateSlugId();

  const config: SlugConfig = {
    upstream_url: params.upstream_url,
    auth_header_name: params.auth_header_name || "Authorization",
    auth_header_prefix:
      params.auth_header_prefix !== undefined
        ? params.auth_header_prefix
        : "Bearer ",
    display_name:
      params.display_name || new URL(params.upstream_url).hostname,
    created_at: Date.now(),
  };

  await env.SLUG_KV.put(`slug:${slug}`, JSON.stringify(config));

  return { slug, config };
}
