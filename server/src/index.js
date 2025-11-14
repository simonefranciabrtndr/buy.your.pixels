import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import pkg from "pg";
import purchaseStore from "./purchaseStore.js";

const { Client } = pkg;

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["http://localhost:5173"];

console.log("Loaded ALLOWED_ORIGINS:", process.env.ALLOWED_ORIGINS);
console.log("Allowed origins array:", allowedOrigins);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(bodyParser.json({ limit: "25mb" }));

// -------------------------
// ENV
// -------------------------
const PORT = process.env.PORT || 4000;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = process.env.PAYPAL_ENV || "sandbox";

// Stripe
const stripe = new Stripe(STRIPE_SECRET);

// Postgres
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// Create table if missing
await client.query(`
  CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    x INT, y INT, w INT, h INT,
    image TEXT,
    url TEXT,
    amount INT
  );
`);

// -------------------------
// API
// -------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Board stats
app.get("/api/stats", async (req, res) => {
  const { rows } = await client.query("SELECT * FROM purchases");
  res.json(rows);
});

// Create Stripe session
app.post("/api/checkout/session", async (req, res) => {
  try {
    const { amount, metadata } = req.body;

    const safeMetadata = {};
    if (metadata) {
      for (const key of Object.keys(metadata)) {
        safeMetadata[key] =
          typeof metadata[key] === "string"
            ? metadata[key]
            : JSON.stringify(metadata[key]);
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: { name: "Pixel Purchase" },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.APP_BASE_URL}/?success=true`,
      cancel_url: `${process.env.APP_BASE_URL}/?canceled=true`,
      metadata: safeMetadata,
    });

    console.log("Checkout session created:", session.id);

    res.json({ id: session.id });
  } catch (err) {
    console.error("Stripe Checkout Error:", err);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});

// Acknowledge session after payment
app.post("/api/checkout/session/:sessionId/acknowledge", async (req, res) => {
  const id = req.params.sessionId;
  const session = await stripe.checkout.sessions.retrieve(id);

  if (session.payment_status !== "paid") {
    return res.status(403).json({ error: "Payment not finalized" });
  }

  const meta = session.metadata;

  await client.query(
    `INSERT INTO purchases(id,x,y,w,h,image,url,amount)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
     [
       uuidv4(),
       Number(meta.x),
       Number(meta.y),
       Number(meta.w),
       Number(meta.h),
       meta.image,
       meta.url,
       Number(meta.amount)
     ]
  );

  res.json({ ok: true });
});

// Presence system (ignored)
app.post("/api/presence/heartbeat", (req, res) => {
  res.status(200).json({ ok: true });
});

// ----------------------
// GET /api/purchases
// ----------------------
app.get("/api/purchases", async (req, res) => {
  try {
    const purchases = await purchaseStore.getAll();
    res.json(purchases);
  } catch (err) {
    console.error("Error fetching purchases:", err);
    res.status(500).json({ error: "Cannot fetch purchases" });
  }
});

// ----------------------
// POST /api/purchases
// ----------------------
app.post("/api/purchases", async (req, res) => {
  try {
    const { x, y, width, height, imageUrl, linkUrl } = req.body;

    const saved = await purchaseStore.add({
      x,
      y,
      width,
      height,
      imageUrl,
      linkUrl,
      createdAt: new Date(),
    });

    res.json(saved);
  } catch (err) {
    console.error("Error saving purchase:", err);
    res.status(500).json({ error: "Cannot save purchase" });
  }
});

// -------------------------
// RUN SERVER
// -------------------------
app.listen(PORT, () => {
  console.log("Payment server running on port", PORT);
});
