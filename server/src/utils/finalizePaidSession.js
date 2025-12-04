import { sessions } from "../sessionStore.js";
import { recordPurchase } from "../purchaseStore.js";

const parseJsonSafe = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export async function finalizePaidSession({ sessionId, provider, transactionId, payerEmail }) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.status === "paid") {
    return { success: true, alreadyPaid: true };
  }

  session.status = "paid";
  session.provider = provider;
  session.confirmation = { transactionId, payerEmail };
  sessions.set(sessionId, session);

  // Attempt to persist purchase; fail silently if data is insufficient.
  try {
    const metaRect = parseJsonSafe(session.metadata?.rect);
    const metaTiles = parseJsonSafe(session.metadata?.tiles);
    const rect = session.area?.rect || metaRect || {};
    const tiles =
      (Array.isArray(session.area?.tiles) && session.area.tiles.length && session.area.tiles) ||
      (Array.isArray(metaTiles) && metaTiles.length && metaTiles) ||
      (rect && Object.keys(rect).length ? [rect] : []);

    if (!rect || !tiles.length) {
      return { success: true, stored: false, reason: "Missing rect/tiles" };
    }

    const price = Number((session.amount || 0) / 100);
    const areaVal =
      Number(session.area?.area) ||
      Number(session.metadata?.area) ||
      Number(session.area?.areaValue) ||
      0;

    await recordPurchase({
      id: sessionId,
      rect,
      tiles,
      area: areaVal,
      price,
      link: session.metadata?.link || null,
      uploadedImage: session.metadata?.uploadedImage || null,
      imageTransform: parseJsonSafe(session.metadata?.imageTransform) || {},
      previewData: parseJsonSafe(session.metadata?.previewData) || {},
      nsfw: typeof session.metadata?.nsfw === "boolean" ? session.metadata.nsfw : null,
      paymentIntentId: transactionId,
      profileId: session.profileId || null,
    });
  } catch (err) {
    console.error("[paypal-webhook] finalizePaidSession persist error", err);
  }

  return { success: true };
}
