import pg from "pg";
import { v4 as uuid } from "uuid";
import { config } from "./config.js";

let pool = null;

const isLocalHost = (hostname) => {
  if (!hostname) return false;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
};

const shouldUseSsl = (connectionString) => {
  if (!connectionString) return false;
  if (/\bsslmode=require\b/.test(connectionString)) return true;
  try {
    const { hostname } = new URL(connectionString);
    return hostname && !isLocalHost(hostname);
  } catch {
    return false;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error("Database connection not initialized. Set DATABASE_URL.");
  }
  return pool;
};

export const initializePurchaseStore = async () => {
  if (!config.databaseUrl) {
    console.warn("DATABASE_URL is not configured. Purchases will not be persisted.");
    return;
  }

  const useSsl = shouldUseSsl(config.databaseUrl) || process.env.NODE_ENV === "production";
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY,
      rect JSONB NOT NULL,
      tiles JSONB NOT NULL,
      area INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      link TEXT,
      uploaded_image TEXT,
      image_transform JSONB,
      preview_data JSONB,
      nsfw BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

const isUuid = (value = "") => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const recordPurchase = async (purchase) => {
  const db = getPool();
  const purchaseId = isUuid(purchase.id) ? purchase.id : uuid();
  const values = [
    purchaseId,
    JSON.stringify(purchase.rect || {}),
    JSON.stringify(purchase.tiles || []),
    Math.round(Number(purchase.area) || 0),
    Number(purchase.price || 0),
    purchase.link || null,
    purchase.uploadedImage || null,
    JSON.stringify(purchase.imageTransform || {}),
    JSON.stringify(purchase.previewData || {}),
    Boolean(purchase.nsfw),
  ];

  const { rows } = await db.query(
    `
      INSERT INTO purchases (
        id,
        rect,
        tiles,
        area,
        price,
        link,
        uploaded_image,
        image_transform,
        preview_data,
        nsfw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id)
      DO UPDATE SET
        rect = EXCLUDED.rect,
        tiles = EXCLUDED.tiles,
        area = EXCLUDED.area,
        price = EXCLUDED.price,
        link = EXCLUDED.link,
        uploaded_image = EXCLUDED.uploaded_image,
        image_transform = EXCLUDED.image_transform,
        preview_data = EXCLUDED.preview_data,
        nsfw = EXCLUDED.nsfw
      RETURNING *;
    `,
    values
  );

  return normalizePurchase(rows[0]);
};

export const listPurchases = async () => {
  if (!pool) return [];
  const { rows } = await pool.query("SELECT * FROM purchases ORDER BY created_at ASC");
  return rows.map(normalizePurchase);
};

export const sumPurchasedPixels = async () => {
  if (!pool) return 0;
  const { rows } = await pool.query("SELECT COALESCE(SUM(area), 0) AS total FROM purchases");
  return Number(rows[0]?.total || 0);
};

export const updatePurchaseModeration = async (id, { nsfw }) => {
  if (!pool) {
    throw new Error("Database not initialized");
  }
  const updates = [];
  const values = [id];
  if (typeof nsfw === "boolean") {
    updates.push(`nsfw = $${updates.length + 2}`);
    values.push(nsfw);
  }
  if (!updates.length) {
    throw new Error("No valid moderation fields provided");
  }
  const query = `
    UPDATE purchases
    SET ${updates.join(", ")}
    WHERE id = $1
    RETURNING *;
  `;
  const { rows } = await pool.query(query, values);
  if (!rows.length) {
    throw new Error("Purchase not found");
  }
  return normalizePurchase(rows[0]);
};

const normalizePurchase = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    rect: row.rect,
    tiles: row.tiles,
    area: Number(row.area || 0),
    price: Number(row.price || 0),
    link: row.link,
    uploadedImage: row.uploaded_image,
    imageTransform: row.image_transform,
    previewData: row.preview_data,
    nsfw: row.nsfw,
    createdAt: row.created_at,
  };
};
