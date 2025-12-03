import pg from "pg";
import { v4 as uuid } from "uuid";
import { config } from "./config.js";
import { initializeProfileStore } from "./profileStore.js";
import { initializeUserStore } from "./userStore.js";
import { safeQuery } from "./utils/safeQuery.js";

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

export const getPool = () => {
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
      nsfw BOOLEAN DEFAULT NULL,
      payment_intent_id TEXT,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;`);
  await pool.query(`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;`);

  await initializeProfileStore(pool);
  await initializeUserStore(pool);
};

const isUuid = (value = "") => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const recordPurchase = async (purchase) => {
  const db = getPool();
  const purchaseId = isUuid(purchase.id) ? purchase.id : uuid();
  const rect = purchase.rect || {};
  const tiles = Array.isArray(purchase.tiles) ? purchase.tiles : [];
  const imageTransform = purchase.imageTransform || {};
  const previewData = purchase.previewData || {};
  const paymentIntentId = purchase.paymentIntentId || purchase.payment_intent_id || null;

  if (!rect || typeof rect !== "object" || !tiles.length) {
    throw new Error("Invalid purchase payload");
  }

  const normalizedNsfw = typeof purchase.nsfw === "boolean" ? purchase.nsfw : null;
  const values = [
    purchaseId,
    JSON.stringify(rect),
    JSON.stringify(tiles),
    Math.round(Number(purchase.area) || 0),
    Number(purchase.price || 0),
    purchase.link || null,
    purchase.uploadedImage || null,
    JSON.stringify(imageTransform),
    JSON.stringify(previewData),
    normalizedNsfw,
    paymentIntentId,
    purchase.profileId || null,
  ];

  const { rows } = await safeQuery(
    db,
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
        nsfw,
        payment_intent_id,
        profile_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        nsfw = EXCLUDED.nsfw,
        payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, purchases.payment_intent_id),
        profile_id = COALESCE(EXCLUDED.profile_id, purchases.profile_id)
      RETURNING *;
    `,
    values
  );

  return normalizePurchase(rows[0]);
};

export const listPurchases = async () => {
  if (!pool) return [];
  const { rows } = await safeQuery(pool, "SELECT * FROM purchases WHERE deleted_at IS NULL ORDER BY created_at ASC", []);
  return rows.map(normalizePurchase).filter(Boolean);
};

export const listPendingModeration = async () => {
  if (!pool) return [];
  const { rows } = await safeQuery(
    pool,
    `
    SELECT p.*, pr.email
    FROM purchases p
    LEFT JOIN profiles pr ON pr.id = p.profile_id
    WHERE p.nsfw IS NULL AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC
    `,
    []
  );
  return rows
    .map((row) => ({
      ...normalizePurchase(row),
      email: row.email || null,
    }))
    .filter(Boolean);
};

export const sumPurchasedPixels = async () => {
  if (!pool) return 0;
  const { rows } = await safeQuery(pool, "SELECT COALESCE(SUM(area), 0) AS total FROM purchases WHERE deleted_at IS NULL", []);
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
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
  const { rows } = await safeQuery(pool, query, values);
  if (!rows.length) {
    throw new Error("Purchase not found");
  }
  return normalizePurchase(rows[0]);
};

export const listPurchasesByProfile = async (profileId) => {
  if (!pool || !profileId) return [];
  const { rows } = await safeQuery(
    pool,
    "SELECT * FROM purchases WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
    [profileId]
  );
  return rows.map(normalizePurchase).filter(Boolean);
};

export const updateOwnedPurchase = async (profileId, purchaseId, { link, uploadedImage, imageTransform, nsfw, previewData }) => {
  if (!pool || !profileId) {
    throw new Error("Unauthorized");
  }
  const updates = [];
  const values = [profileId, purchaseId];
  if (typeof link !== "undefined") {
    updates.push(`link = $${values.length + 1}`);
    values.push(link || null);
  }
  if (typeof uploadedImage !== "undefined") {
    updates.push(`uploaded_image = $${values.length + 1}`);
    values.push(uploadedImage || null);
  }
  if (typeof imageTransform !== "undefined") {
    updates.push(`image_transform = $${values.length + 1}`);
    values.push(JSON.stringify(imageTransform || {}));
  }
  if (typeof previewData !== "undefined") {
    updates.push(`preview_data = $${values.length + 1}`);
    values.push(JSON.stringify(previewData || {}));
  }
  if (typeof nsfw !== "undefined") {
    updates.push(`nsfw = $${values.length + 1}`);
    values.push(typeof nsfw === "boolean" ? nsfw : null);
  }
  if (!updates.length) {
    throw new Error("No updates submitted");
  }
  const query = `
    UPDATE purchases
    SET ${updates.join(", ")}
    WHERE profile_id = $1 AND id = $2
    RETURNING *;
  `;
  const { rows } = await safeQuery(pool, query, values);
  if (!rows.length) {
    throw new Error("Purchase not found");
  }
  return normalizePurchase(rows[0]);
};

const normalizePurchase = (row) => {
  if (!row || row.deleted_at) return null;
  return {
    id: row.id,
    rect: typeof row.rect === "string" ? JSON.parse(row.rect) : row.rect || {},
    tiles: typeof row.tiles === "string" ? JSON.parse(row.tiles) : row.tiles || [],
    area: Number(row.area || 0),
    price: Number(row.price || 0),
    link: row.link,
    uploadedImage: row.uploaded_image,
    imageTransform: typeof row.image_transform === "string" ? JSON.parse(row.image_transform) : row.image_transform || {},
    previewData: typeof row.preview_data === "string" ? JSON.parse(row.preview_data) : row.preview_data || {},
    nsfw: row.nsfw,
    nsfwConfidence: row.nsfw_confidence || null,
    paymentIntentId: row.payment_intent_id || null,
    profileId: row.profile_id,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
};
