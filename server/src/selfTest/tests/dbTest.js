import { getPool } from "../../purchaseStore.js";
import { safeQuery } from "../../utils/safeQuery.js";

export async function dbTest() {
  const details = {};
  try {
    const pool = getPool();
    const start = Date.now();
    await safeQuery(pool, "SELECT 1", []);
    details.latency_ms = Date.now() - start;

    const tables = await safeQuery(
      pool,
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('purchases','profiles')
      `,
      []
    );
    details.tables = tables.rows.map((r) => r.table_name);

    const columns = await safeQuery(
      pool,
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN ('purchases','profiles')
      `,
      []
    );
    details.columns = columns.rows;

    const txn = await pool.connect();
    try {
      await txn.query("BEGIN");
      await txn.query("SAVEPOINT sp");
      await txn.query("SELECT 1");
      await txn.query("ROLLBACK TO SAVEPOINT sp");
      await txn.query("ROLLBACK");
      details.txn = "ok";
    } finally {
      txn.release();
    }

    const requiredPurchColumns = ["id", "area", "price", "created_at"];
    const purchaseCols = columns.rows.filter((r) => r.table_name === "purchases").map((r) => r.column_name);
    const missingPurch = requiredPurchColumns.filter((c) => !purchaseCols.includes(c));
    if (missingPurch.length) {
      return { success: false, error: "Missing purchase columns", details: { missingPurch } };
    }

    const requiredProfileCols = ["id", "email", "created_at"];
    const profileCols = columns.rows.filter((r) => r.table_name === "profiles").map((r) => r.column_name);
    const missingProfile = requiredProfileCols.filter((c) => !profileCols.includes(c));
    if (missingProfile.length) {
      return { success: false, error: "Missing profile columns", details: { missingProfile } };
    }

    return { success: true, details };
  } catch (error) {
    return { success: false, error: error?.message || "DB error", details };
  }
}
