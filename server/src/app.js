import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import Stripe from "stripe";
import { config } from "./config.js";
import { touchPresence, getPresenceStats } from "./presenceStore.js";
import {
  listPurchases,
  listPurchasesByProfile,
  recordPurchase,
  sumPurchasedPixels,
  updateOwnedPurchase,
  updatePurchaseModeration,
  listPendingModeration,
} from "./purchaseStore.js";
import { sendPurchaseReceiptEmail, sendPurchaseFailureEmail, sendSupportAlertEmail, sendTestEmail } from "./notifications.js";
import { createProfileRecord, findProfileByEmail, findProfileById } from "./profileStore.js";
import authRouter from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { resolveDomainDiagnostics } from "./utils/dnsCheck.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { sendMetaPurchaseEvent } from "./analytics/meta.js";
import { analyzeImageSafety } from "./utils/imageSafety.js";
import { validateAndNormalizeURL } from "./utils/linkValidator.js";
import { validateTransform } from "./utils/safeImageTransform.js";
import { getPool } from "./purchaseStore.js";
import { runSelfTests, getLastReport } from "./selfTest/runner.js";
import * as paypalClient from "./paypalClient.js";

const maskValue = (v) => {
  if (!v) return null;
  if (v.length <= 8) return "*****";
  return v.slice(0, 3) + "..." + v.slice(-3);
};

// FIX: enforce critical secrets
if (!process.env.PROFILE_TOKEN_SECRET) {
  throw new Error("PROFILE_TOKEN_SECRET environment variable is required");
}
const stripeClient = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: "2024-06-20" }) : null;

const sessions = new Map();
const purchaseDedupKeys = new Set(); // FIX: basic idempotency guard
const developerSessions = new Map();
const DEVELOPER_SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours
const PROFILE_SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const PROFILE_TOKEN_SECRET = process.env.PROFILE_TOKEN_SECRET;

const buildSelectionSummary = (area) => {
  if (!area) return null;
  return {
    pixels: Math.round(area.area || 0),
    tiles: Array.isArray(area.tiles) ? area.tiles.length : 1,
  };
};

const createDeveloperSession = () => {
  const token = uuid();
  developerSessions.set(token, { createdAt: Date.now() });
  return token;
};

const verifyDeveloperToken = (token) => {
  if (!token) return false;
  const session = developerSessions.get(token);
  if (!session) return false;
  const expired = Date.now() - session.createdAt > DEVELOPER_SESSION_TTL;
  if (expired) {
    developerSessions.delete(token);
    return false;
  }
  return true;
};

const requireDeveloperAuth = (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!verifyDeveloperToken(token)) {
    return res.status(401).json({ error: "Developer authentication required" });
  }
  req.developerToken = token;
  next();
};

const createProfileSession = (profileId) => {
  const timestamp = Date.now();
  const base = `${profileId}.${timestamp}`;
  const signature = crypto.createHmac("sha256", PROFILE_TOKEN_SECRET).update(base).digest("hex");
  return `${base}.${signature}`;
};

const verifyProfileToken = (token) => {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const [profileId, timestampStr, signature] = segments;
  const timestamp = Number(timestampStr);
  if (!profileId || !timestamp || !signature) return null;
  const base = `${profileId}.${timestamp}`;
  const expected = crypto.createHmac("sha256", PROFILE_TOKEN_SECRET).update(base).digest("hex");
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }
  const expired = Date.now() - timestamp > PROFILE_SESSION_TTL;
  if (expired) return null;
  return profileId;
};

const requireProfileAuth = async (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const profileId = verifyProfileToken(token);
  if (!profileId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  req.profileToken = token;
  req.profileId = profileId;
  next();
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });

const verifyPassword = (storedHash, password) =>
  new Promise((resolve, reject) => {
    if (!storedHash) return resolve(false);
    const [salt, key] = storedHash.split(":");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(key === derivedKey.toString("hex"));
    });
  });

const attachProfileFromAuth = (req) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return verifyProfileToken(token);
};

const allowedOrigins = Array.from(new Set([...config.allowedOrigins, "https://api.yourpixels.online"]));

// FIX: validation helpers
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value) => Number.isFinite(Number(value));

const validateCheckoutBody = (body = {}) => {
  const priceOk = isFiniteNumber(body.price) && Number(body.price) > 0;
  const areaOk = typeof body.area === "object" && body.area !== null;
  return priceOk && areaOk;
};

const validatePurchasePayload = (payload = {}) => {
  const rectOk =
    payload.rect &&
    ["x", "y", "w", "h"].every((k) => isFiniteNumber(payload.rect[k])) &&
    Number(payload.rect.w) > 0 &&
    Number(payload.rect.h) > 0;
  const tilesOk = Array.isArray(payload.tiles) && payload.tiles.length > 0;
  const areaOk = isFiniteNumber(payload.area) && Number(payload.area) > 0;
  const priceOk = isFiniteNumber(payload.price) && Number(payload.price) >= 0;
  return rectOk && tilesOk && areaOk && priceOk;
};

const validateProfileRegisterBody = (body = {}) =>
  isNonEmptyString(body.email) && isNonEmptyString(body.username) && isNonEmptyString(body.password);

const validateProfileLoginBody = (body = {}) => isNonEmptyString(body.email) && isNonEmptyString(body.password);

const validatePresenceHeartbeatBody = (body = {}) =>
  isNonEmptyString(body.sessionId) && (body.selectionPixels === undefined || isFiniteNumber(body.selectionPixels));

const validateDeveloperLoginBody = (body = {}) => isNonEmptyString(body.password);

const validatePreviewData = (data = {}) => {
  if (!data || typeof data !== "object") return null;
  const coords = ["x", "y", "w", "h"];
  const out = {};
  for (const key of coords) {
    if (typeof data[key] !== "undefined") {
      const num = Number(data[key]);
      if (!Number.isFinite(num)) throw new Error("Invalid preview data");
      out[key] = num;
    }
  }
  return out;
};

const isUnsafeImagePayload = (payload = "") => {
  if (typeof payload !== "string") return false;
  const lowered = payload.toLowerCase();
  return (
    lowered.includes("<script") ||
    lowered.includes("<svg") ||
    lowered.includes("javascript:") ||
    lowered.includes("<html") ||
    lowered.includes("<body") ||
    lowered.startsWith("data:text/html") ||
    lowered.startsWith("data:text/svg")
  );
};

const logContentRejection = ({ profileId, reason, nsfwConfidence, ip, userAgent }) => {
  console.warn("[content_rejected]", {
    type: "content_rejected",
    profileId,
    reason,
    nsfwConfidence,
    ip,
    userAgent,
  });
};

const computePriceFromExistingLogic = (body = {}) => {
  const sessionId = body.sessionId || body.purchaseId || body.id || null;
  const session = sessionId ? sessions.get(sessionId) : null;
  const description = body.description || "Buy Your Pixels purchase";
  const metadata = {
    ...(session?.metadata || {}),
    ...(body.metadata || {}),
  };

  if (body.area) {
    const areaValue = body.area?.area ?? body.area;
    if (typeof metadata.area === "undefined") {
      metadata.area = areaValue;
    }
    if (body.area?.rect && typeof metadata.rect === "undefined") {
      metadata.rect = JSON.stringify(body.area.rect);
    }
    if (body.area?.tiles && typeof metadata.tiles === "undefined") {
      metadata.tiles = JSON.stringify(body.area.tiles);
    }
  }

  if (session) {
    const amountMajor = Number(session.amount || 0) / 100;
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      throw new Error("Invalid session amount");
    }
    return {
      sessionId,
      amount: amountMajor,
      amountInMinor: Number(session.amount || 0),
      currency: (session.currency || "EUR").toUpperCase(),
      description,
      metadata,
    };
  }

  if (!validateCheckoutBody(body)) {
    throw new Error("Invalid request");
  }

  const normalizedPrice = Number(body.price);
  return {
    sessionId,
    amount: normalizedPrice,
    amountInMinor: Math.round(normalizedPrice * 100),
    currency: (body.currency || "EUR").toUpperCase(),
    description,
    metadata,
  };
};

const markPurchasePaid = (sessionId, payload = {}) => {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.status = "paid";
  session.provider = payload.provider || session.provider || null;
  session.confirmation = payload;
  sessions.set(sessionId, session);
  return session;
};

// FIX: rate limiters for auth-sensitive endpoints
const profileAuthRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "profile-auth",
});

const developerAuthRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "developer-auth",
});

const checkoutRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyPrefix: "checkout",
});

const purchaseRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyPrefix: "purchase",
});

const emailTestRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  keyPrefix: "test-email",
});

const dnsDebugRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  keyPrefix: "dns-debug",
});

const selfTestRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  keyPrefix: "self-test",
});

export const createApp = () => {
  const app = express();
  app.disable("etag");
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));
  app.use(authMiddleware);

  app.get("/api/health", (_req, res) => {
    const start = Date.now();
    const payload = { status: "ok", database: "not_configured" };
    let pool = null;
    try {
      pool = config.databaseUrl ? getPool() : null;
    } catch {
      pool = null;
    }
    if (!pool) {
      return res.json(payload);
    }
    pool
      .query("SELECT 1;")
      .then(() => {
        payload.database = "connected";
        payload.latency_ms = Date.now() - start;
        res.json(payload);
      })
      .catch(() => {
        payload.database = "error";
        res.json(payload);
      });
  });

  app.use("/api/auth", authRouter);

  app.get("/api/self-test/run", selfTestRateLimit, async (_req, res) => {
    try {
      const report = await runSelfTests();
      res.json(report);
    } catch (err) {
      console.error("[self-test] failed", err);
      res.status(500).json({ success: false, error: "Self-test failed" });
    }
  });

  app.get("/api/self-test/report", selfTestRateLimit, (_req, res) => {
    res.json(getLastReport());
  });

  app.get("/api/self-test/quick", selfTestRateLimit, (_req, res) => {
    const last = getLastReport();
    res.json({ ok: !!last?.success });
  });

  app.get("/api/test-email", emailTestRateLimit, async (req, res) => {
    try {
      const to = process.env.TEST_EMAIL_TO;
      if (!to) {
        return res.status(500).json({ error: "TEST_EMAIL_TO env variable missing" });
      }

      await sendTestEmail(to);

      return res.json({ success: true, message: "Test email sent to " + to });
    } catch (err) {
      console.error("❌ Test email failed:", err);
      return res.status(500).json({ error: "Failed to send test email" });
    }
  });

  app.get("/api/debug/dns", dnsDebugRateLimit, async (_req, res) => {
    try {
      const result = await resolveDomainDiagnostics("yourpixels.online");
      console.log("[dns-debug]", result);

      if (result.status === "error") {
        return res.status(500).json(result);
      }

      return res.json(result);
    } catch (err) {
      console.error("[dns-debug] unexpected failure", err);
      return res
        .status(500)
        .json({ status: "error", message: "DNS lookup failed", details: err.message });
    }
  });

  app.post("/api/checkout/session", checkoutRateLimit, async (req, res) => {
    if (!validateCheckoutBody(req.body)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { area, price, currency = "eur", metadata = {} } = req.body || {};
    const normalizedPrice = Number(price);

    const amountInMinor = Math.round(normalizedPrice * 100);
    const sessionId = uuid();
    const response = {
      sessionId,
      currency: currency.toUpperCase(),
      amount: amountInMinor,
      availableMethods: [],
      summary: buildSelectionSummary(area),
    };
    try {
      if (stripeClient && config.stripe.publishableKey) {
        try {
          const paymentIntent = await stripeClient.paymentIntents.create({
            amount: amountInMinor,
            currency: currency.toLowerCase(),
            payment_method_types: ["card", "link"], // Avoid Stripe-provided PayPal; keep card/link wallets
            metadata: {
              sessionId,
              ...metadata,
            },
          });

          response.stripe = {
            clientSecret: paymentIntent.client_secret,
            publishableKey: config.stripe.publishableKey,
            paymentIntentId: paymentIntent.id,
          };
          response.availableMethods.push("stripe");
        } catch (stripeErr) {
          console.error("Stripe PaymentIntent failed", stripeErr);
        }
      }

      if (!response.availableMethods.length) {
        return res.status(503).json({
          error: "No payment methods available",
        });
      }

      sessions.set(sessionId, {
        sessionId,
        amount: amountInMinor,
        currency: currency.toLowerCase(),
        area,
        metadata,
        providers: {
          stripe: response.stripe?.paymentIntentId || null,
        },
        status: "pending",
      });

      console.log("[checkout] Created checkout session", {
        sessionId,
        amount: amountInMinor,
        currency: currency.toLowerCase(),
        providers: response.availableMethods,
      });

      res.json(response);
    } catch (err) {
      console.error("[checkout] Failed to create checkout session", err);
      try {
        await sendSupportAlertEmail({
          type: "checkout_error",
          path: req.path,
          userId: req.user?.id,
          email: req.user?.email,
          errorMessage: err.message,
          stack: err.stack,
          additionalContext: {
            body: { price: req.body?.price, currency: req.body?.currency, area: req.body?.area ? "provided" : "missing" },
            query: req.query,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          },
        });
      } catch (alertErr) {
        console.error("[checkout] support alert failed", alertErr);
      }
      res.status(500).send("Unable to create checkout session");
    }
  });

  app.post("/api/checkout/session/:sessionId/acknowledge", (req, res) => {
    const { sessionId } = req.params;
    const { provider } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).send("Session not found");
    }
    markPurchasePaid(sessionId, {
      provider,
      ...(req.body?.payload || {}),
    });
    console.log("[checkout] Acknowledged payment session", { sessionId, provider });
    res.json({ status: "acknowledged" });
  });

  app.get("/api/paypal/config", (req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID || null;
    const env = process.env.PAYPAL_ENV || "sandbox";

    if (!clientId) {
      return res.json({ enabled: false, reason: "Missing PAYPAL_CLIENT_ID" });
    }

    return res.json({
      enabled: true,
      clientId,
      env,
      currency: "EUR",
    });
  });

  app.post("/api/paypal/create-order", checkoutRateLimit, async (req, res) => {
    try {
      const { amount, currency, description, metadata, sessionId } = computePriceFromExistingLogic(req.body);
      const customId =
        typeof metadata === "string"
          ? metadata
          : metadata?.sessionId || metadata?.orderId || sessionId || null;

      const order = await paypalClient.createOrder({
        amount,
        currency,
        description,
        metadata: customId ? String(customId) : undefined,
      });

      if (sessionId && order?.id) {
        const session = sessions.get(sessionId);
        if (session) {
          session.providers = {
            ...(session.providers || {}),
            paypal: order.id,
          };
          sessions.set(sessionId, session);
        }
      }

      return res.json({ success: true, orderId: order.id, status: order.status });
    } catch (err) {
      console.error("PayPal create-order error:", err);
      return res.json({ success: false, error: err.message });
    }
  });

  app.post("/api/paypal/capture-order", async (req, res) => {
    try {
      const { orderId, purchaseId } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Missing orderId" });
      }

      const cap = await paypalClient.captureOrder(orderId);

      markPurchasePaid(purchaseId, {
        provider: "paypal",
        transactionId: cap.id,
        status: cap.status,
        payerEmail: cap.payerEmail,
      });

      return res.json({ success: true, orderId: cap.id, status: cap.status, payerEmail: cap.payerEmail || null });
    } catch (err) {
      console.error("PayPal capture error:", err);
      return res.json({ success: false, error: err.message });
    }
  });

  app.post("/api/presence/heartbeat", (req, res) => {
    if (!validatePresenceHeartbeatBody(req.body)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { sessionId, isSelecting = false, selectionPixels = 0 } = req.body || {};
    touchPresence({ sessionId, isSelecting, selectionPixels });
    res.json({ status: "ok" });
  });

  app.post("/api/developer/login", developerAuthRateLimit, (req, res) => {
    if (!config.developer.password) {
      return res.status(503).json({ error: "Developer access not configured" });
    }
    if (!validateDeveloperLoginBody(req.body)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { password } = req.body || {};
    if (password !== config.developer.password) {
      return res.status(401).json({ error: "Invalid developer credentials" });
    }
    const token = createDeveloperSession();
    res.json({ token, expiresIn: DEVELOPER_SESSION_TTL });
  });

  app.get("/api/developer/purchases", requireDeveloperAuth, async (_req, res) => {
    try {
      const purchases = await listPurchases();
      res.json({ purchases });
    } catch (error) {
      console.error("Developer list purchases failed", error);
      res.status(500).json({ error: "Unable to load purchases" });
    }
  });

  app.patch("/api/developer/purchases/:purchaseId", requireDeveloperAuth, async (req, res) => {
    const { purchaseId } = req.params;
    const { nsfw } = req.body || {};
    if (!purchaseId) {
      return res.status(400).json({ error: "Missing purchase id" });
    }
    if (typeof nsfw !== "boolean") {
      return res.status(400).json({ error: "nsfw flag must be provided" });
    }
    try {
      const updated = await updatePurchaseModeration(purchaseId, { nsfw });
      res.json(updated);
    } catch (error) {
      console.error("Developer update purchase failed", error);
      res.status(500).json({ error: "Unable to update purchase" });
    }
  });

  app.get("/api/developer/moderation/pending", requireDeveloperAuth, async (_req, res) => {
    try {
      const pending = await listPendingModeration();
      res.json({
        purchases: pending.map((p) => ({
          id: p.id,
          email: p.email || null,
          tiles: p.tiles,
          preview: p.previewData,
          createdAt: p.createdAt,
          nsfw: p.nsfw,
          nsfwConfidence: p.nsfwConfidence || null,
        })),
      });
    } catch (error) {
      console.error("[moderation] failed to list pending", error);
      res.status(500).json({ error: "Unable to load pending moderation items" });
    }
  });

  app.post("/api/profile/register", profileAuthRateLimit, async (req, res) => {
    if (!validateProfileRegisterBody(req.body)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { email, username, password, subscribeNewsletter, avatarData } = req.body || {};
    try {
      const existing = await findProfileByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "A profile with this email already exists" });
      }
      const passwordHash = await hashPassword(password);
      const profile = await createProfileRecord({
        email,
        username,
        passwordHash,
        avatarData,
        newsletter: subscribeNewsletter,
      });
      const token = createProfileSession(profile.id);
      const purchases = await listPurchasesByProfile(profile.id);
      res.json({ token, profile, purchases });
    } catch (error) {
      console.error("Profile registration failed", error);
      res.status(500).json({ error: "Unable to complete profile registration" });
    }
  });

  app.post("/api/profile/login", profileAuthRateLimit, async (req, res) => {
    if (!validateProfileLoginBody(req.body)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { email, password } = req.body || {};
    try {
      const existing = await findProfileByEmail(email);
      if (!existing) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await verifyPassword(existing.raw.password_hash, password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = createProfileSession(existing.raw.id);
      const purchases = await listPurchasesByProfile(existing.raw.id);
      res.json({ token, profile: existing.profile, purchases });
    } catch (error) {
      console.error("Profile login failed", error);
      res.status(500).json({ error: "Unable to login" });
    }
  });

  app.get("/api/profile/me", requireProfileAuth, async (req, res) => {
    try {
      const profileRecord = await findProfileById(req.profileId);
      if (!profileRecord) {
        return res.status(404).json({ error: "Profile not found" });
      }
      const purchases = await listPurchasesByProfile(req.profileId);
      res.json({ profile: profileRecord.profile, purchases });
    } catch (error) {
      console.error("Profile fetch failed", error);
      res.status(500).json({ error: "Unable to load profile" });
    }
  });

  app.put("/api/profile/purchases/:purchaseId", requireProfileAuth, async (req, res) => {
    const { purchaseId } = req.params;
    const { link, uploadedImage, imageTransform, nsfw, previewData } = req.body || {};
    try {
      const userPurchases = await listPurchasesByProfile(req.profileId);
      const existing = userPurchases.find((p) => String(p.id) === String(purchaseId));
      if (!existing) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      let normalizedLink = existing.link;
      if (typeof link !== "undefined") {
        try {
          normalizedLink = link ? validateAndNormalizeURL(link) : null;
        } catch (err) {
          logContentRejection({
            profileId: req.profileId,
            reason: "invalid_link",
            nsfwConfidence: 0,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
          return res.status(400).json({ error: "Invalid content" });
        }
      }

      let normalizedTransform = existing.imageTransform;
      if (typeof imageTransform !== "undefined") {
        try {
          normalizedTransform = validateTransform(imageTransform) || {};
        } catch {
          return res.status(400).json({ error: "Invalid content" });
        }
      }

      let normalizedPreview = existing.previewData;
      if (typeof previewData !== "undefined") {
        try {
          normalizedPreview = validatePreviewData(previewData) || {};
        } catch {
          return res.status(400).json({ error: "Invalid content" });
        }
      }

      let normalizedImage = typeof uploadedImage !== "undefined" ? uploadedImage : existing.uploadedImage;
      let nsfwFlag = typeof nsfw === "boolean" ? nsfw : existing.nsfw;

      if (typeof uploadedImage !== "undefined") {
        if (isUnsafeImagePayload(uploadedImage)) {
          nsfwFlag = true;
          logContentRejection({
            profileId: req.profileId,
            reason: "unsafe_image_payload",
            nsfwConfidence: 0.9,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
          return res.status(400).json({ error: "Invalid content" });
        }
        const safety = await analyzeImageSafety(uploadedImage);
        if (!safety.safe) {
          nsfwFlag = true;
          logContentRejection({
            profileId: req.profileId,
            reason: safety.reason || "unsafe_image",
            nsfwConfidence: safety.nsfwConfidence,
            ip: req.ip,
            userAgent: req.get("user-agent"),
          });
        }
      }

      const updated = await updateOwnedPurchase(req.profileId, purchaseId, {
        link: normalizedLink,
        uploadedImage: normalizedImage,
        imageTransform: normalizedTransform,
        nsfw: nsfwFlag,
        previewData: normalizedPreview,
      });
      res.json(updated);
    } catch (error) {
      console.error("Profile purchase update failed", error);
      res.status(500).json({ error: "Unable to update purchase" });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    const boardWidth = Math.max(0, Number(config.board?.width) || 0);
    const boardHeight = Math.max(0, Number(config.board?.height) || 0);
    const totalPixels = boardWidth * boardHeight;
    const purchasedPixels = Math.min(totalPixels, await sumPurchasedPixels());
    const availablePixels = Math.max(0, totalPixels - purchasedPixels);
    const presence = getPresenceStats();

    res.json({
      board: { width: boardWidth, height: boardHeight, totalPixels },
      purchasedPixels,
      availablePixels,
      onlineUsers: presence.onlineUsers,
      activeSelections: presence.activeSelections,
      selectedPixels: Math.min(totalPixels, presence.selectedPixels),
    });
  });

  app.get("/api/purchases", async (_req, res) => {
    if (!config.databaseUrl) {
      return res.json({ purchases: [] });
    }
    try {
      const purchases = await listPurchases();
      res.json({ purchases });
    } catch (error) {
      console.error("Failed to load purchases", error);
      res.status(500).send("Unable to load purchases");
    }
  });

  app.post("/api/purchases/failed", async (req, res) => {
    const body = req.body || {};
    const pixels = Number(body.pixels) || 0;
    const totalAmount = Number(body.totalAmount) || 0;
    const currency = body.currency || "EUR";
    const errorCode = body.errorCode || null;
    const errorMessage = body.errorMessage || null;
    const stripePaymentIntentId = body.stripePaymentIntentId || null;

    const profileId = attachProfileFromAuth(req);
    let profileRecord = null;
    if (profileId) {
      try {
        profileRecord = await findProfileById(profileId);
      } catch (err) {
        console.error("[checkout] unable to load profile for failure email", err);
      }
    }

    console.log("[checkout] purchase failed event", {
      userId: profileId || null,
      email: profileRecord?.profile?.email,
      pixels,
      totalAmount,
      currency,
      errorCode,
      errorMessage,
      stripePaymentIntentId,
    });

    if (profileRecord?.profile?.email) {
      Promise.resolve().then(async () => {
        try {
          await sendPurchaseFailureEmail(profileRecord.profile, {
            attemptedAmount: totalAmount,
            currency,
            pixelCount: pixels,
            errorCode,
            errorMessage,
            failedAt: new Date(),
          });
        } catch (err) {
          console.error("[checkout] purchase failure email error", { error: err.message });
        }
      });
    }

    return res.json({ status: "ok" });
  });

  app.post("/api/purchases", purchaseRateLimit, async (req, res) => {
    if (!config.databaseUrl) {
      return res.status(503).json({ error: "Service unavailable" });
    }
    const payload = req.body || {};
    if (!validatePurchasePayload(payload)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    let nsfwFlag = typeof payload.nsfw === "boolean" ? payload.nsfw : null;
    let normalizedPreview = {};
    try {
      normalizedPreview = validatePreviewData(payload.previewData) || {};
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }
    let normalizedTransform = {};
    try {
      normalizedTransform = validateTransform(payload.imageTransform) || {};
    } catch {
      return res.status(400).json({ error: "Invalid request" });
    }
    let normalizedLink = payload.link;
    if (typeof payload.link !== "undefined" && payload.link !== null) {
      try {
        normalizedLink = validateAndNormalizeURL(payload.link);
      } catch (err) {
        logContentRejection({
          profileId: req.profileId,
          reason: "invalid_link",
          nsfwConfidence: 0,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
        return res.status(400).json({ error: "Invalid content" });
      }
    }
    if (payload.uploadedImage) {
      if (isUnsafeImagePayload(payload.uploadedImage)) {
        nsfwFlag = true;
        logContentRejection({
          profileId: req.profileId,
          reason: "unsafe_image_payload",
          nsfwConfidence: 0.9,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
        return res.status(400).json({ error: "Invalid content" });
      }
      const safety = await analyzeImageSafety(payload.uploadedImage);
      if (!safety.safe) {
        nsfwFlag = true;
        logContentRejection({
          profileId: req.profileId,
          reason: safety.reason || "unsafe_image",
          nsfwConfidence: safety.nsfwConfidence,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      }
    }
    const dedupKey = payload.id || payload.paymentIntentId || payload.sessionId;
    if (dedupKey && purchaseDedupKeys.has(dedupKey)) {
      return res.status(409).json({ error: "Duplicate purchase" });
    }
    try {
      const profileId = attachProfileFromAuth(req);
      req.profileId = profileId;
      const saved = await recordPurchase({
        id: payload.id,
        rect: payload.rect,
        tiles: payload.tiles,
        area: payload.area,
        price: payload.price,
        link: normalizedLink,
        uploadedImage: payload.uploadedImage,
        imageTransform: normalizedTransform,
        previewData: normalizedPreview,
        nsfw: nsfwFlag,
        paymentIntentId: payload.paymentIntentId || payload.payment_intent_id || null,
        profileId,
      });
      const profileRecord = profileId ? await findProfileById(profileId) : null;
      console.log("[purchases] Recorded purchase", {
        id: saved?.id,
        pixels: saved?.area?.area || saved?.area || 0,
        price: saved?.price,
        profileId: saved?.profileId || profileId || null,
      });
      if (dedupKey) {
        purchaseDedupKeys.add(dedupKey);
      }
      res.status(201).json(saved);

      // fire-and-forget email (does not block the response)
      const profileForEmail = profileRecord?.profile || null;
      Promise.resolve().then(async () => {
        try {
          if (profileForEmail && saved?.area) {
            await sendPurchaseReceiptEmail({
              email: profileForEmail.email || "unknown",
              profile: profileForEmail,
              purchase: saved,
              pixels: saved.area,
              amountEUR: saved.price,
              purchaseId: saved.id,
            });
          }
          const eventId = saved?.id ? `YP-${String(saved.id).slice(0, 8)}` : undefined;
          await sendMetaPurchaseEvent({
            value: Number(saved?.price) || 0,
            currency: saved?.currency || "EUR",
            eventId,
            clientIp: req.ip,
            userAgent: req.get("user-agent"),
            sourceUrl: `${config.baseUrl || "https://yourpixels.online"}/success`,
          });
        } catch (err) {
          console.error("[purchases] Failed to send purchase receipt", err);
        }
      });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Duplicate purchase" });
      }
      console.error("Failed to store purchase", error);
      Promise.resolve().then(async () => {
        try {
          await sendSupportAlertEmail({
            type: "purchase_persist_error",
            path: req.path,
            userId: req.profileId,
            email: req.body?.email,
            orderRef: req.body?.id,
            errorMessage: error.message,
            stack: error.stack,
            additionalContext: {
              pixels: req.body?.area,
              totalAmount: req.body?.price,
              currency: req.body?.currency || "EUR",
            },
          });
        } catch (alertErr) {
          console.error("[purchases] support alert failed", alertErr);
        }
      });
      res.status(500).send("Unable to store purchase");
    }
  });

  app.get("/api/test/env", (req, res) => {
    const keysToShow = [
      "NODE_ENV",
      "RESEND_API_KEY",
      "TEST_EMAIL_TO",
      "STRIPE_SECRET_KEY",
      "STRIPE_PUBLISHABLE_KEY",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_ENV",
      "GOOGLE_CLIENT_ID",
    ];

    const result = {};
    for (const k of keysToShow) {
      const val = process.env[k];
      result[k] = val ? maskValue(val) : null;
    }

    return res.json({
      success: true,
      env: result,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err, _req, res, _next) => {
    console.error("Unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
};
