const phishingHosts = new Set(["bit.ly", "t.co", "goo.gl", "tinyurl.com", "ow.ly"]);

const isIp = (host = "") => /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[?[0-9a-f:]+\]?$/i.test(host);
const isLocal = (host = "") =>
  ["localhost", "127.0.0.1", "::1"].includes(host) ||
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

export function validateAndNormalizeURL(url) {
  if (!url || typeof url !== "string") {
    throw new Error("Invalid URL");
  }
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Invalid URL");
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("Invalid URL");
  }
  const host = parsed.hostname.toLowerCase();
  if (isIp(host) || isLocal(host)) {
    throw new Error("Invalid URL");
  }
  if (phishingHosts.has(host)) {
    throw new Error("Invalid URL");
  }

  const clean = new URL(`${protocol}//${host}${parsed.pathname}`);
  // Preserve only ?ref= if provided
  if (parsed.searchParams.has("ref")) {
    clean.searchParams.set("ref", parsed.searchParams.get("ref"));
  }
  return clean.toString();
}
