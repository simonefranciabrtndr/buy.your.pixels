import checkoutNodeJssdk from "@paypal/checkout-server-sdk";
import { config } from "./config.js";

const { paypal } = config;

let paypalClient = null;

const getPayPalClient = () => {
  if (!paypal.clientId || !paypal.clientSecret) return null;
  if (paypalClient) return paypalClient;
  const Environment = paypal.environment === "live"
    ? checkoutNodeJssdk.core.LiveEnvironment
    : checkoutNodeJssdk.core.SandboxEnvironment;
  const environment = new Environment(paypal.clientId, paypal.clientSecret);
  paypalClient = new checkoutNodeJssdk.core.PayPalHttpClient(environment);
  return paypalClient;
};

export const createPayPalOrder = async ({ amount, currency, referenceId, description }) => {
  const client = getPayPalClient();
  if (!client) return null;

  const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: referenceId,
        amount: {
          currency_code: currency.toUpperCase(),
          value: (amount / 100).toFixed(2),
        },
        description,
      },
    ],
  });
  const order = await client.execute(request);
  return {
    orderId: order.result.id,
    links: order.result.links,
  };
};

export const capturePayPalOrder = async (orderId) => {
  const client = getPayPalClient();
  if (!client) throw new Error("PayPal client not configured");
  const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});
  const capture = await client.execute(request);
  return capture.result;
};
