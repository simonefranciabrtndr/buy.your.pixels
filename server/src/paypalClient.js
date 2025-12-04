const clientId = process.env.PAYPAL_CLIENT_ID || "";
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
const paypalEnv = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const baseUrl = paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const buildAmountValue = (amount) => {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error("Invalid PayPal amount");
  }
  return normalized.toFixed(2);
};

export async function getAccessToken() {
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing");
  }
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[paypal] access token request failed", text);
      throw new Error("Unable to obtain PayPal access token");
    }

    const json = await response.json();
    if (!json?.access_token) {
      throw new Error("Invalid PayPal token response");
    }
    return json.access_token;
  } catch (err) {
    console.error("[paypal] access token error", err);
    throw err;
  }
}

export async function createOrder({ amount, currency = "EUR", description, metadata } = {}) {
  try {
    const accessToken = await getAccessToken();
    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: (currency || "EUR").toUpperCase(),
            value: buildAmountValue(amount),
          },
          description: description || "Buy Your Pixels purchase",
          custom_id: metadata || undefined,
        },
      ],
    };

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[paypal] createOrder failed", text);
      throw new Error("Unable to create PayPal order");
    }

    const json = await response.json();
    return {
      id: json?.id,
      status: json?.status,
      raw: json,
    };
  } catch (err) {
    console.error("[paypal] createOrder error", err);
    throw err;
  }
}

export async function captureOrder(orderId) {
  if (!orderId) {
    throw new Error("Missing orderId");
  }
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[paypal] captureOrder failed", text);
      throw new Error("Unable to capture PayPal order");
    }

    const json = await response.json();
    const capture = json?.purchase_units?.[0]?.payments?.captures?.[0] || null;
    const payerEmail =
      capture?.payer?.email_address ||
      json?.payer?.email_address ||
      json?.payment_source?.paypal?.email_address ||
      null;
    return {
      id: capture?.id || json?.id,
      status: capture?.status || json?.status,
      payerEmail,
      raw: json,
    };
  } catch (err) {
    console.error("[paypal] captureOrder error", err);
    throw err;
  }
}
