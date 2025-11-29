const normalizeBaseUrl = (value) => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const inferApiBaseUrl = () => {
  const envBase = normalizeBaseUrl(import.meta?.env?.VITE_API_URL);
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    return normalizeBaseUrl(isLocalhost ? "http://localhost:4000" : origin);
  }

  return normalizeBaseUrl("http://localhost:4000");
};

export default inferApiBaseUrl;
