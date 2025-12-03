import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializePurchaseStore } from "./purchaseStore.js";
import { ensureIndexes } from "./utils/dbMaintenance.js";

// FIX: critical env checks
const requiredEnv = ["JWT_SECRET", "PROFILE_TOKEN_SECRET"];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

if (!process.env.RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set; email sending will be disabled.");
}
if (!config.stripe.secretKey || !config.stripe.publishableKey) {
  console.error("Stripe keys are missing; checkout will be unavailable.");
}

const app = createApp();
const port = config.port || process.env.PORT || 4000;

const start = async () => {
  try {
    await initializePurchaseStore();
    try {
      await ensureIndexes();
      console.log("[dbMaintenance] indexes ensured");
    } catch (err) {
      console.warn("[dbMaintenance] failed to ensure indexes", err?.message);
    }
    app.listen(port, () => {
      console.log(`Payment server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
