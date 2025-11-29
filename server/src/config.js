import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const allowedOrigins = ["https://yourpixels.online", "https://www.yourpixels.online", "https://api.yourpixels.online"];

export const config = {
  port: toNumber(process.env.PORT, 4000),
  baseUrl: allowedOrigins[0],
  allowedOrigins,
  databaseUrl: process.env.DATABASE_URL || "",
  board: {
    width: toNumber(process.env.BOARD_WIDTH, 1200),
    height: toNumber(process.env.BOARD_HEIGHT, 900),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    environment: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
  },
  developer: {
    password: process.env.DEVELOPER_PASSWORD || "",
  },
};
