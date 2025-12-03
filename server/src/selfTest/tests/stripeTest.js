import Stripe from "stripe";
import { config } from "../../config.js";

export async function stripeTest() {
  if (!config.stripe.secretKey) {
    return { success: false, error: "Missing Stripe key" };
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
    return { success: false, error: error?.message || "Stripe error" };
  }
}
