import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOrigins = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    return `${url.protocol}//${host}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
};

const addOriginVariants = (set, origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return;
  set.add(normalized);
  if (normalized.includes("://www.")) {
    set.add(normalized.replace("://www.", "://"));
  } else if (normalized.includes("://")) {
    set.add(normalized.replace("://", "://www."));
  }
};

const allowedOrigins = (() => {
  const combined = [process.env.ALLOWED_ORIGINS, process.env.APP_BASE_URL].filter(Boolean).join(",");
  const parsed = parseOrigins(combined);
  const set = new Set();
  parsed.forEach((origin) => addOriginVariants(set, origin));

  if (set.size === 0) {
    addOriginVariants(set, "http://localhost:5173");
  }

  ["https://yourpixels.online", "https://www.yourpixels.online"].forEach((origin) => {
    addOriginVariants(set, origin);
  });

  return Array.from(set);
})();

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
