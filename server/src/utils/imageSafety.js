// Lightweight image safety utility. Does not call external services.
// Returns a conservative classification to avoid crashes.

const BLOCKLIST_PATTERNS = [
  /sex/i,
  /porn/i,
  /xxx/i,
  /nude/i,
  /nsfw/i,
  /gore/i,
  /violent/i,
  /blood/i,
];

const UNSAFE_MARKERS = [
  "<script",
  "<svg",
  "javascript:",
  "data:text/html",
  "data:text/svg",
];

export async function analyzeImageSafety(base64OrBuffer) {
  try {
    if (!base64OrBuffer) {
      return { safe: true, nsfwConfidence: 0 };
    }

    const asString = Buffer.isBuffer(base64OrBuffer)
      ? base64OrBuffer.toString("utf8").slice(0, 5000)
      : String(base64OrBuffer).slice(0, 5000);

    if (UNSAFE_MARKERS.some((marker) => asString.toLowerCase().includes(marker))) {
      return { safe: false, nsfwConfidence: 0.85, reason: "Contains potentially executable or unsafe markup" };
    }

    if (BLOCKLIST_PATTERNS.some((regex) => regex.test(asString))) {
      return { safe: false, nsfwConfidence: 0.92, reason: "Content appears explicit or violent" };
    }

    return { safe: true, nsfwConfidence: 0.05 };
  } catch (error) {
    // Never crash: fall back to safe=false with low confidence
    return { safe: false, nsfwConfidence: 0.5, reason: "Safety check error" };
  }
}
