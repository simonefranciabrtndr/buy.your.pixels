export function formatError(err, context = {}) {
  try {
    const now = new Date().toISOString();
    const base = {
      message: err?.message || "Unknown error",
      name: err?.name || "Error",
      code: err?.code || err?.status || null,
      stack: err?.stack || null,
      timestamp: now,
      http: {
        status: err?.response?.status || err?.status || null,
        statusText: err?.response?.statusText || err?.statusText || null,
        headers: err?.response?.headers || null,
        body: null,
      },
      context,
    };

    // Axios-like error
    if (err?.response?.data) {
      base.http.body = err.response.data;
      return base;
    }

    // Fetch-like Response
    if (err?.response && typeof err.response.text === "function") {
      return err.response
        .clone()
        .text()
        .then((text) => {
          try {
            base.http.body = JSON.parse(text);
          } catch {
            base.http.body = text || "unreadable";
          }
          return base;
        })
        .catch(() => base);
    }

    // If error has body property
    if (err?.body) {
      base.http.body = err.body;
    }

    return base;
  } catch {
    return {
      message: "Failed to format error",
      name: "FormatError",
      code: null,
      stack: null,
      timestamp: new Date().toISOString(),
      http: { status: null, statusText: null, headers: null, body: null },
      context,
    };
  }
}
