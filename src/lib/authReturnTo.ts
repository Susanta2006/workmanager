// Post-sign-in destination for the auth pages.
//
// Reads ?returnTo= only. Only same-origin, in-app paths are allowed. Auth pages and
// bootstrap parameters are never valid destinations, so a login cannot loop back into itself.
const AUTH_PAGES = new Set(["/login", "/register"]);
const BOOTSTRAP_PARAMS = ["access_token", "clear_access_token", "returnTo"];

export function safeReturnTo(search?: string) {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(search ?? window.location.search);
  return sanitizeReturnTo(params.get("returnTo"));
}

export function sanitizeReturnTo(raw: unknown) {
  if (!raw || typeof raw !== "string" || typeof window === "undefined") return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    for (const param of BOOTSTRAP_PARAMS) url.searchParams.delete(param);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (AUTH_PAGES.has(pathname)) return "/";
    const path = url.pathname + url.search;
    // Exactly one leading slash, and no backslash that browsers could turn into another host.
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}

// The current page as a returnTo value, applying the same rules as any other destination.
export function currentPath() {
  if (typeof window === "undefined") return "/";
  return sanitizeReturnTo(window.location.pathname + window.location.search);
}

// `search` for a <Link> to an auth page that should come back to `returnTo`.
export function returnToSearch(returnTo?: string): { returnTo?: string } {
  return returnTo && returnTo !== "/" ? { returnTo } : {};
}
