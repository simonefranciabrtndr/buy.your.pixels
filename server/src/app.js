import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import Stripe from "stripe";
import { config } from "./config.js";
import { capturePayPalOrder, createPayPalOrder } from "./paypal.js";
import { touchPresence, getPresenceStats } from "./presenceStore.js";
import {
  listPurchases,
  listPurchasesByProfile,
  recordPurchase,
  sumPurchasedPixels,
  updateOwnedPurchase,
  updatePurchaseModeration,
} from "./purchaseStore.js";
import { sendProfileWelcome } from "./notifications.js";
import { createProfileRecord, findProfileByEmail, findProfileById } from "./profileStore.js";
import authRouter from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";

const stripeClient = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: "2024-06-20" }) : null;

const sessions = new Map();
const developerSessions = new Map();
const DEVELOPER_SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours
const PROFILE_SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const PROFILE_TOKEN_SECRET = process.env.PROFILE_TOKEN_SECRET || config.stripe.secretKey || "profile-secret";

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
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);

  app.post("/api/checkout/session", async (req, res) => {
    const { area, price, currency = "eur", metadata = {} } = req.body || {};
    const normalizedPrice = Number(price);
    if (!area || !Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      return res.status(400).send("Invalid selection or price");
    }

    const amountInMinor = Math.round(normalizedPrice * 100);
    const sessionId = uuid();
    const response = {
      sessionId,
      currency: currency.toUpperCase(),
      amount: amountInMinor,
      availableMethods: [],
      summary: buildSelectionSummary(area),
    };
    const providerErrors = [];

    try {
      if (stripeClient && config.stripe.publishableKey) {
        try {
          const paymentIntent = await stripeClient.paymentIntents.create({
            amount: amountInMinor,
            currency: currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
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
          providerErrors.push({
            provider: "stripe",
            message: stripeErr?.message || "Stripe is temporarily unavailable",
          });
        }
      }

      try {
        const paypalOrder = await createPayPalOrder({
          amount: amountInMinor,
          currency,
          referenceId: sessionId,
          description: "Buy Your Pixels order",
        });

        if (paypalOrder) {
          response.paypal = {
            orderId: paypalOrder.orderId,
            clientId: config.paypal.clientId,
          };
          response.availableMethods.push("paypal");
        }
      } catch (paypalErr) {
        console.error("PayPal order creation failed", paypalErr);
        providerErrors.push({
          provider: "paypal",
          message: paypalErr?.message || "PayPal is temporarily unavailable",
        });
      }

      if (!response.availableMethods.length) {
        return res.status(503).json({
          error: "No payment methods available",
          details: providerErrors,
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
          paypal: response.paypal?.orderId || null,
        },
        status: "pending",
      });

      res.json(response);
    } catch (err) {
      console.error("Failed to create checkout session", err);
      res.status(500).send("Unable to create checkout session");
    }
  });

  app.post("/api/paypal/orders/:orderId/capture", async (req, res) => {
    try {
      const capture = await capturePayPalOrder(req.params.orderId);
      res.json(capture);
    } catch (err) {
      console.error("PayPal capture failed", err);
      res.status(500).send("Unable to capture PayPal order");
    }
  });

  app.post("/api/checkout/session/:sessionId/acknowledge", (req, res) => {
    const { sessionId } = req.params;
    const { provider } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).send("Session not found");
    }
    session.status = "paid";
    session.provider = provider;
    session.confirmation = req.body?.payload;
    sessions.set(sessionId, session);
    res.json({ status: "acknowledged" });
  });

  app.post("/api/presence/heartbeat", (req, res) => {
    const { sessionId, isSelecting = false, selectionPixels = 0 } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    touchPresence({ sessionId, isSelecting, selectionPixels });
    res.json({ status: "ok" });
  });

  app.post("/api/developer/login", (req, res) => {
    if (!config.developer.password) {
      return res.status(503).json({ error: "Developer access not configured" });
    }
    const { password } = req.body || {};
    if (!password || password !== config.developer.password) {
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

  app.post("/api/profile/register", async (req, res) => {
    const { email, username, password, subscribeNewsletter, avatarData } = req.body || {};
    if (!email || !username || !password) {
      return res.status(400).json({ error: "Email, username and password are required" });
    }
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
      await sendProfileWelcome({
        email: profile.email,
        username: profile.username,
        subscribeNewsletter: Boolean(subscribeNewsletter),
      });
      const purchases = await listPurchasesByProfile(profile.id);
      res.json({ token, profile, purchases });
    } catch (error) {
      console.error("Profile registration failed", error);
      res.status(500).json({ error: "Unable to complete profile registration" });
    }
  });

  app.post("/api/profile/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
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
      const updated = await updateOwnedPurchase(req.profileId, purchaseId, {
        link,
        uploadedImage,
        imageTransform,
        nsfw,
        previewData,
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

  app.post("/api/purchases", async (req, res) => {
    if (!config.databaseUrl) {
      return res.status(503).send("Database not configured");
    }
    const payload = req.body || {};
    if (!payload?.rect || !payload?.tiles || !payload?.area) {
      return res.status(400).send("Invalid payload");
    }
    try {
      const saved = await recordPurchase({
        id: payload.id,
        rect: payload.rect,
        tiles: payload.tiles,
        area: payload.area,
        price: payload.price,
        link: payload.link,
        uploadedImage: payload.uploadedImage,
        imageTransform: payload.imageTransform,
        previewData: payload.previewData,
        nsfw: payload.nsfw,
        profileId: attachProfileFromAuth(req),
      });
      res.status(201).json(saved);
    } catch (error) {
      console.error("Failed to store purchase", error);
      res.status(500).send("Unable to store purchase");
    }
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
