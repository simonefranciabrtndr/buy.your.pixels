import Stripe from "stripe";
import { config } from "../../config.js";
import { formatError } from "../utils/formatError.js";

export async function stripeTest() {
  if (!config.stripe.secretKey) {
    const error = { message: "Missing Stripe key" };
    const formatted = await formatError(error, { test: "stripeTest" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    return { success: false, error: formatted };
  }

  const stripe = new Stripe(config.stripe.secretKey, { apiVersion: "2024-06-20" });

  try {
    const pi = await stripe.paymentIntents.create({
      amount: 100,
      currency: "eur",
      confirm: false,
      capture_method: "manual",
      metadata: { self_test: "true" },
    });
    return { success: true, details: { id: pi.id, status: pi.status, liveMode: pi.livemode } };
  } catch (error) {
    const formatted = await formatError(error, { test: "stripeTest" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    return { success: false, error: formatted };
  }
}
