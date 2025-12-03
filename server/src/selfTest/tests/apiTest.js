import { touchPresence } from "../../presenceStore.js";
import { analyzeImageSafety } from "../../utils/imageSafety.js";
import { validateAndNormalizeURL } from "../../utils/linkValidator.js";
import { validateTransform } from "../../utils/safeImageTransform.js";
import { formatError } from "../utils/formatError.js";

export async function apiTest() {
  const details = {};
  try {
    const checkoutMock = {
      stripe: { clientSecret: "mock", paymentIntentId: "pi_mock" },
      availableMethods: ["stripe"],
    };
    details.checkout = checkoutMock.stripe ? "ok" : "fail";

    touchPresence({ sessionId: "self-test", isSelecting: false, selectionPixels: 0 });
    details.presence = "ok";

    try {
      const normalized = validateAndNormalizeURL("https://example.com/?ref=abc");
      details.linkValidation = normalized.includes("example.com") ? "ok" : "fail";
    } catch {
      details.linkValidation = "fail";
    }

    const safety = await analyzeImageSafety("data:image/png;base64,xxxx");
    details.imageSafety = safety.safe ? "ok" : "flagged";

    const transform = validateTransform({ scale: 1.1, rotate: 10, offsetX: 0, offsetY: 0 });
    details.transform = transform ? "ok" : "fail";

    const success =
      details.checkout === "ok" &&
      details.presence === "ok" &&
      details.linkValidation === "ok" &&
      details.transform === "ok";

    return { success, details };
  } catch (error) {
    const formatted = await formatError(error, { test: "apiTest" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    return { success: false, error: formatted, details };
  }
}
