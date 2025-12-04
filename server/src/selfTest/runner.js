import { dbTest } from "./tests/dbTest.js";
import { stripeTest } from "./tests/stripeTest.js";
import { paypalTest } from "./tests/paypalTest.js";
import { emailTest } from "./tests/emailTest.js";
import { apiTest } from "./tests/apiTest.js";

let lastReport = null;

/**
 * In-memory history of recent self-test runs.
 * We keep at most 50 entries, newest at the end.
 */
const history = [];

async function runWithTiming(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const finishedAt = Date.now();
    return {
      name,
      success: Boolean(result?.success ?? true),
      details: result?.details ?? result ?? null,
      duration_ms: finishedAt - startedAt,
      error: result?.error || null,
    };
  } catch (err) {
    const finishedAt = Date.now();
    console.error("[self-test] test failed:", name, {
      message: err?.message,
      stack: err?.stack,
    });
    return {
      name,
      success: false,
      details: null,
      duration_ms: finishedAt - startedAt,
      error: {
        message: err?.message || "Unknown error",
        name: err?.name || "Error",
      },
    };
  }
}

/**
 * Run all self tests and store both last report and history.
 */
export async function runSelfTests() {
  const startedAt = new Date().toISOString();

  const tests = [
    await runWithTiming("database", dbTest),
    await runWithTiming("stripe", stripeTest),
    await runWithTiming("paypal", paypalTest),
    await runWithTiming("email", emailTest),
    await runWithTiming("api", apiTest),
  ];

  const finishedAt = new Date().toISOString();
  const success = tests.every((t) => t.success);

  const report = {
    success,
    startedAt,
    finishedAt,
    tests,
  };

  lastReport = report;

  // push into history (max 50 items)
  history.push(report);
  if (history.length > 50) {
    history.shift();
  }

  return report;
}

/**
 * Return the last self-test report (or a default object).
 */
export function getLastReport() {
  if (lastReport) return lastReport;
  return {
    success: false,
    startedAt: null,
    finishedAt: null,
    tests: [],
  };
}

/**
 * Return an array of historical reports.
 * Newest report should be last in the array.
 */
export function getSelfTestHistory() {
  return history.slice();
}
