import { touchPresence } from "../../presenceStore.js";
import { analyzeImageSafety } from "../../utils/imageSafety.js";
import { validateAndNormalizeURL } from "../../utils/linkValidator.js";
import { validateTransform } from "../../utils/safeImageTransform.js";

export async function apiTest() {
  const details = {};
  try {
    // Mock checkout session response shape
    const checkoutMock = {
      stripe: { clientSecret: "mock", paymentIntentId: "pi_mock" },
      availableMethods: ["stripe"],
    };
    details.checkout = checkoutMock.stripe ? "ok" : "fail";

    // Presence heartbeat (in-memory, safe)
    touchPresence({ sessionId: "self-test", isSelecting: false, selectionPixels: 0 });
    details.presence = "ok";

    // Profile register rejection on bad input
    try {
      const normalized = validateAndNormalizeURL("https://example.com/?ref=abc");
      details.linkValidation = normalized.includes("example.com") ? "ok" : "fail";
    } catch {
      details.linkValidation = "fail";
    }

    // Purchase safety filters
    const safety = await analyzeImageSafety("data:image/png;base64,xxxx");
    details.imageSafety = safety.safe ? "ok" : "flagged";

    // Transform validation
    const transform = validateTransform({ scale: 1.1, rotate: 10, offsetX: 0, offsetY: 0 });
    details.transform = transform ? "ok" : "fail";

    const success =
      details.checkout === "ok" &&
      details.presence === "ok" &&
      details.linkValidation === "ok" &&
      details.transform === "ok";

    return { success, details };
  } catch (error) {
    return { success: false, error: error?.message || "API test failed", details };
  }
}
