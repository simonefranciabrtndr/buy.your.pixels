import { formatError } from "../utils/formatError.js";

export async function emailTest() {
  const started = Date.now();
  try {
    const res = await fetch("https://api.resend.com/domains", { method: "GET" });
    return { success: res.ok, status: res.status, duration_ms: Date.now() - started };
  } catch (error) {
    const formatted = await formatError(error, {
      test: "emailTest",
      request: { url: "https://api.resend.com/domains", method: "GET" },
      startedAt: started,
    });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    return { success: false, error: formatted };
  }
}
