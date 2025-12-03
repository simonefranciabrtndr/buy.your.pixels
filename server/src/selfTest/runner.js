import { dbTest } from "./tests/dbTest.js";
import { stripeTest } from "./tests/stripeTest.js";
import { emailTest } from "./tests/emailTest.js";
import { apiTest } from "./tests/apiTest.js";

let lastReport = null;

const runWithTiming = async (name, fn) => {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      name,
      success: !!result?.success,
      details: result?.details || result || {},
      duration_ms: Date.now() - startedAt,
      error: result?.success ? null : result?.error || null,
    };
  } catch (err) {
    return {
      name,
      success: false,
      duration_ms: Date.now() - startedAt,
      error: err,
      details: {},
    };
  }
};

export async function runSelfTests() {
  const startedAt = new Date().toISOString();
  const tests = [
    await runWithTiming("database", dbTest),
    await runWithTiming("stripe", stripeTest),
    await runWithTiming("email", emailTest),
    await runWithTiming("api", apiTest),
  ];

  const success = tests.every((t) => t.success);
  lastReport = {
    success,
    startedAt,
    finishedAt: new Date().toISOString(),
    tests,
  };
  return lastReport;
}

export function getLastReport() {
  return lastReport || { status: "no_report" };
}
