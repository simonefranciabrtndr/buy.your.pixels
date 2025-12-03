// Safe query wrapper to normalize errors and guard parameter mismatches
export async function safeQuery(pool, text, params = []) {
  if (!pool) {
    throw new Error("Database pool not initialized");
  }

  const paramCount = Array.from(text.matchAll(/\$\d+/g)).length;
  if (paramCount && paramCount !== params.length) {
    throw new Error("Query parameter count mismatch");
  }

  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error("[db] query error", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });
    throw error;
  }
}
