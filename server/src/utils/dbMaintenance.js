import { safeQuery } from "./safeQuery.js";
import { getPool } from "../purchaseStore.js";

const INDEX_QUERIES = [
  // Profiles
  "CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);",
  "CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);",
  // Purchases
  "CREATE INDEX IF NOT EXISTS idx_purchases_profile_id ON purchases(profile_id);",
  "CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);",
  "CREATE INDEX IF NOT EXISTS idx_purchases_rect ON purchases((rect->>'x'), (rect->>'y'));",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_unique_payment ON purchases(payment_intent_id) WHERE payment_intent_id IS NOT NULL;",
];

export async function ensureIndexes() {
  let pool = null;
  try {
    pool = getPool();
  } catch {
    console.warn("[dbMaintenance] Pool not initialized; skipping index creation");
    return;
  }

  for (const query of INDEX_QUERIES) {
    try {
      await safeQuery(pool, query, []);
    } catch (err) {
      console.warn("[dbMaintenance] index creation failed", { query, error: err?.message });
    }
  }
}
