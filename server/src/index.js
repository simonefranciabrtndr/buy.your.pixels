import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializePurchaseStore } from "./purchaseStore.js";

const app = createApp();
const port = config.port || process.env.PORT || 4000;

const start = async () => {
  try {
    await initializePurchaseStore();
    app.listen(port, () => {
      console.log(`Payment server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
