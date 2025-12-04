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
      return { success: false, reason: "invalid-payload" };
    }

    const price = Number((session.amount || 0) / 100);
    const areaVal =
      Number(session.area?.area) ||
      Number(session.metadata?.area) ||
      Number(session.area?.areaValue) ||
      0;

    const result = await recordPurchase({
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
    if (result?.duplicate) {
      console.warn("[finalizePaidSession] duplicate purchase ignored", { sessionId });
      return { success: true, alreadyPaid: true, persisted: false, reason: "duplicate" };
    }
    if (result) {
      console.log("[finalizePaidSession] persisted purchase", { sessionId, provider });
    } else {
      console.warn("[finalizePaidSession] duplicate purchase ignored", { sessionId });
      return { success: true, alreadyPaid: true, persisted: false, reason: "duplicate" };
    }
  } catch (err) {
    if (err?.code === "23505") {
      console.warn("[finalizePaidSession] duplicate purchase ignored", { sessionId });
      return { success: true, alreadyPaid: true, persisted: false, reason: "duplicate" };
    }
    console.error("[finalizePaidSession] persist error", { message: err?.message || "unknown", sessionId });
    return { success: false, error: err?.message || "persist_failed" };
  }

  return { success: true };
}
