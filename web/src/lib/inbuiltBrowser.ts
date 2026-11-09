/**
 * Inbuilt Browser utilities.
 * Ensures all URLs (external websites and localhost) open seamlessly inside the
 * inbuilt browser surface without redirecting outside to external browsers.
 */

export function normalizeBrowserUrl(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // If starts with localhost or an IP address, default to http
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  // Otherwise default to https
  return `https://${trimmed}`;
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeBrowserUrl(url));
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "[::1]" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Returns the destination URL for the inbuilt browser iframe.
 * Localhost URLs load directly to preserve WebSockets, HMR, and speed.
 * Remote external URLs route through the backend proxy (`/api/proxy?url=...`)
 * which strips `X-Frame-Options` and `Content-Security-Policy: frame-ancestors`,
 * allowing any website to display inside the embedded frame.
 */
export function toInbuiltBrowserUrl(url: string): string {
  const normalized = normalizeBrowserUrl(url);
  if (!normalized) return "";
  if (isLocalhostUrl(normalized)) {
    return normalized;
  }
  return `/api/proxy?url=${encodeURIComponent(normalized)}`;
}

/**
 * Dispatches an event to open a URL in the inbuilt browser without leaving the app.
 */
export function openInbuiltBrowser(url: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeBrowserUrl(url);
  window.dispatchEvent(
    new CustomEvent("bark-open-browser", {
      detail: { url: normalized },
    })
  );
}
