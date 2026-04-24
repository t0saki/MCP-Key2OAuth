export function extractSlugFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[1] === "mcp") {
    return parts[0];
  }
  return null;
}

export function extractSlugFromResource(
  resource: string | string[] | undefined
): string | null {
  const value = Array.isArray(resource) ? resource[0] : resource;
  if (!value) return null;
  try {
    const url = new URL(value);
    return extractSlugFromPath(url.pathname);
  } catch {
    return null;
  }
}
