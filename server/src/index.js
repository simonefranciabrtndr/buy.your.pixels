import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializePurchaseStore } from "./purchaseStore.js";

const start = async () => {
  try {
    await initializePurchaseStore();
  } catch (error) {
    console.error("Failed to initialize purchase store", error);
    process.exit(1);
  }

  const app = createApp();
  const port = process.env.PORT ? Number(process.env.PORT) : config.port;
  app.listen(port, () => {
    console.log(`Payment server running on port ${port}`);
  });
};

start().catch((error) => {
  console.error("Server startup failed", error);
  process.exit(1);
});
