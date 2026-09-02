const UTM_PREFIX = "utm_";

/**
 * Normalizes a URL for storage and dedupe comparison: lowercases the scheme
 * and host, strips a single trailing slash from the path (root becomes
 * empty), removes every utm_* query parameter while preserving the order of
 * the rest, and leaves the hash untouched.
 */
export function normalizeUrl(input: string): string {
  const parsed = new URL(input);

  let pathname = parsed.pathname;
  if (pathname === "/") {
    pathname = "";
  } else if (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (!key.toLowerCase().startsWith(UTM_PREFIX)) {
      kept.append(key, value);
    }
  }
  const search = kept.toString();

  return `${parsed.protocol}//${parsed.host}${pathname}${search ? `?${search}` : ""}${parsed.hash}`;
}
