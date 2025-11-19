const inferApiBaseUrl = () => {
  const envBase = import.meta?.env?.VITE_API_BASE_URL;
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    return isLocalhost ? "http://localhost:4000" : origin;
  }

  return "http://localhost:4000";
};

export default inferApiBaseUrl;
