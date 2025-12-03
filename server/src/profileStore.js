import { v4 as uuid } from "uuid";
import { safeQuery } from "./utils/safeQuery.js";

let pool = null;

const mapProfile = (row) =>
  row
    ? {
        id: row.id,
        email: row.email,
        username: row.username,
        avatarData: row.avatar_data,
        newsletter: row.newsletter,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.created_at ? new Date(row.created_at).toISOString() : null,
      }
    : null;

export const initializeProfileStore = async (sharedPool) => {
  pool = sharedPool;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_data TEXT,
      newsletter BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'purchases' AND column_name = 'profile_id'
      ) THEN
        ALTER TABLE purchases ADD COLUMN profile_id UUID REFERENCES profiles(id);
      END IF;
    END
    $$;
  `);
};

export const createProfileRecord = async ({ email, username, passwordHash, avatarData, newsletter }) => {
  const id = uuid();
  const normalizedEmail = String(email || "").toLowerCase();
  const existing = await findProfileByEmail(normalizedEmail);
  if (existing?.profile) {
    throw new Error("Email already registered");
  }
  const { rows } = await safeQuery(
    pool,
    `
      INSERT INTO profiles (id, email, username, password_hash, avatar_data, newsletter)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `,
    [id, normalizedEmail, username, passwordHash, typeof avatarData === "string" ? avatarData : null, Boolean(newsletter)]
  );
  return mapProfile(rows[0]);
};

export const findProfileByEmail = async (email) => {
  const normalizedEmail = String(email || "").toLowerCase();
  const { rows } = await safeQuery(pool, `SELECT * FROM profiles WHERE email = $1 LIMIT 1`, [normalizedEmail]);
  return rows.length ? { raw: rows[0], profile: mapProfile(rows[0]) } : null;
};

export const findProfileById = async (id) => {
  const { rows } = await safeQuery(pool, `SELECT * FROM profiles WHERE id = $1 LIMIT 1`, [id]);
  return rows.length ? { raw: rows[0], profile: mapProfile(rows[0]) } : null;
};
