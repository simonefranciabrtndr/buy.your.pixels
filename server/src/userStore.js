import { v4 as uuid } from "uuid";

let pool = null;

const mapUser = (row) =>
  row
    ? {
        id: row.id,
        email: row.email,
        provider: row.provider,
        providerId: row.provider_id,
        createdAt: row.created_at,
      }
    : null;

export const initializeUserStore = async (sharedPool) => {
  pool = sharedPool;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      provider TEXT DEFAULT 'local',
      provider_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

const getPool = () => {
  if (!pool) {
    throw new Error("User store not initialized");
  }
  return pool;
};

export const createUser = async ({ email, passwordHash, provider = "local", providerId = null }) => {
  const db = getPool();
  const id = uuid();
  const { rows } = await db.query(
    `
      INSERT INTO users (id, email, password_hash, provider, provider_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `,
    [id, email, passwordHash, provider, providerId]
  );
  return mapUser(rows[0]);
};

export const findUserByEmail = async (email) => {
  const db = getPool();
  const { rows } = await db.query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email]);
  return rows.length ? { raw: rows[0], user: mapUser(rows[0]) } : null;
};

export const findUserById = async (id) => {
  const db = getPool();
  const { rows } = await db.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return rows.length ? { raw: rows[0], user: mapUser(rows[0]) } : null;
};

export const findUserByProvider = async (provider, providerId) => {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT * FROM users WHERE provider = $1 AND provider_id = $2 LIMIT 1`,
    [provider, providerId]
  );
  return rows.length ? { raw: rows[0], user: mapUser(rows[0]) } : null;
};

export const createUserFromProvider = async ({ provider, providerId, email = null }) => {
  const db = getPool();
  const id = uuid();
  const fallbackEmail = email || `${provider}-${providerId}@${provider}.oauth`;
  const { rows } = await db.query(
    `
      INSERT INTO users (id, email, password_hash, provider, provider_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `,
    [id, fallbackEmail, null, provider, providerId]
  );
  return mapUser(rows[0]);
};
