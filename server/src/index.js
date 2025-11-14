import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import {
  initializePurchaseStore,
  recordPurchase,
  listPurchases,
  sumPurchasedPixels
} from "./purchaseStore.js";

const app = express();

app.use(cors({
  origin: [
    "https://buy-your-pixels.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true,
}));

app.use(bodyParser.json({ limit: "25mb" }));

const PORT = process.env.PORT || 4000;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(STRIPE_SECRET);

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

// -------------------------
// HEALTH
// -------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// -------------------------
// STATS (usa il nuovo store)
// -------------------------
app.get("/api/stats", async (req, res) => {
  try {
    const purchasedPixels = await sumPurchasedPixels();
    res.json({ purchasedPixels });
  } catch (err) {
    console.error("Error loading stats:", err);
    res.status(500).json({ error: "Cannot load stats" });
  }
});

// -------------------------
// STRIPE CHECKOUT SESSION
// -------------------------
app.post("/api/checkout/session", async (req, res) => {
  try {
    const { amount, metadata } = req.body;
    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const amountInMinor = Math.round(normalizedAmount * 100);

    const safeMetadata = {};
    if (metadata) {
      for (const key of Object.keys(metadata)) {
        const value = metadata[key];
        safeMetadata[key] =
          typeof value === "string" ? value : JSON.stringify(value);
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amountInMinor,
            product_data: { name: "Pixel Purchase" }
          },
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${process.env.APP_BASE_URL}/?success=true`,
      cancel_url: `${process.env.APP_BASE_URL}/?canceled=true`,
      metadata: safeMetadata
    });

    console.log("Checkout session created:", session.id);
    res.json({ id: session.id });
  } catch (err) {
    console.error("Stripe Checkout Error:", err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});

// -------------------------
// ACKNOWLEDGE DOPO IL PAGAMENTO
// (salva nel nuovo schema via purchaseStore)
// -------------------------
app.post("/api/checkout/session/:sessionId/acknowledge", async (req, res) => {
  try {
    const id = req.params.sessionId;
    const session = await stripe.checkout.sessions.retrieve(id);

    if (session.payment_status !== "paid") {
      return res.status(403).json({ error: "Payment not finalized" });
    }

    const meta = session.metadata || {};

    const purchasePayload = {
      rect: safeParseJson(meta.rect, meta.rect || {}),
      tiles: safeParseJson(meta.tiles, []),
      area: meta.area ? Number(meta.area) : Number(meta.areaPixels || 0),
      price: meta.price ? Number(meta.price) : Number(meta.amount || 0),
      link: meta.link || meta.url || null,
      uploadedImage: meta.uploadedImage || meta.image || null,
      imageTransform: safeParseJson(meta.imageTransform, {}),
      previewData: safeParseJson(meta.previewData, {}),
      nsfw: meta.nsfw === "true" || meta.nsfw === true
    };

    const saved = await recordPurchase(purchasePayload);

    res.json({ ok: true, purchase: saved });
  } catch (err) {
    console.error("Acknowledge error:", err);
    res.status(500).json({ error: "Acknowledge failed" });
  }
});

// -------------------------
// PRESENCE HEARTBEAT
// -------------------------
app.post("/api/presence/heartbeat", (req, res) => {
  res.status(200).json({ ok: true });
});

// -------------------------
// API ACQUISTI (nuovo store)
// -------------------------
app.get("/api/purchases", async (req, res) => {
  try {
    const purchases = await listPurchases();
    res.json(purchases);
  } catch (err) {
    console.error("Error fetching purchases:", err);
    res.status(500).json({ error: "Cannot fetch purchases" });
  }
});

app.post("/api/purchases", async (req, res) => {
  try {
    const saved = await recordPurchase({
      rect: req.body.rect,
      tiles: req.body.tiles,
      area: req.body.area,
      price: req.body.price,
      link: req.body.link,
      uploadedImage: req.body.uploadedImage,
      imageTransform: req.body.imageTransform,
      previewData: req.body.previewData,
      nsfw: req.body.nsfw
    });

    res.json(saved);
  } catch (err) {
    console.error("Error saving purchase:", err);
    res.status(500).json({ error: "Cannot save purchase" });
  }
});

// -------------------------
// AVVIO SERVER
// -------------------------
async function start() {
  try {
    await initializePurchaseStore();
    app.listen(PORT, () => {
      console.log("Payment server running on port", PORT);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
