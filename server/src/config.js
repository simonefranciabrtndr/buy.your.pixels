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
  meta: {
    pixelId: process.env.META_PIXEL_ID,
    accessToken: process.env.META_ACCESS_TOKEN,
    testEventCode: process.env.META_TEST_EVENT_CODE,
    apiBaseUrl: process.env.META_CONVERSIONS_API_URL || "https://graph.facebook.com/v18.0",
  },
  developer: {
    password: process.env.DEVELOPER_PASSWORD || "",
  },
};
