import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { v4 as uuid } from "uuid";
import Stripe from "stripe";
import { config } from "./config.js";
import { capturePayPalOrder, createPayPalOrder } from "./paypal.js";
import { touchPresence, getPresenceStats } from "./presenceStore.js";
import { listPurchases, recordPurchase, sumPurchasedPixels, updatePurchaseModeration } from "./purchaseStore.js";

const stripeClient = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: "2024-06-20" }) : null;

const sessions = new Map();
const developerSessions = new Map();
const DEVELOPER_SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours

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

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

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
      });
      res.status(201).json(saved);
    } catch (error) {
      console.error("Failed to store purchase", error);
      res.status(500).send("Unable to store purchase");
    }
  });

  return app;
};
