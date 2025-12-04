import { config } from "../../config.js";
import { getAccessToken, createOrder } from "../../paypalClient.js";
import { formatError } from "../utils/formatError.js";

const mask = (value = "") => {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 8) return "*****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const buildApiBase = () => {
  const envBase = process.env.SELF_TEST_API_BASE;
  if (envBase) return envBase.replace(/\/+$/, "");
  return `${(config.baseUrl || "http://localhost:4000").replace(/\/+$/, "")}/api`;
};

export async function paypalTest() {
  const base = buildApiBase();
  const result = {
    success: false,
    config: null,
    token: null,
    createOrder: null,
    sdkUrl: null,
    capture: { skipped: true, reason: "Capture skipped for safety", success: true },
  };

  // A) CONFIG CHECK
  try {
    const res = await fetch(`${base}/paypal/config`);
    const json = await res.json();
    result.config = {
      success: json.enabled !== false,
      enabled: json.enabled,
      reason: json.reason || null,
      env: json.env || null,
      currency: json.currency || null,
      clientIdPresent: Boolean(json.clientId),
    };
    if (!json.enabled) {
      result.success = false;
      return result;
    }
    if (!json.clientId) {
      result.config.success = false;
      result.success = false;
      return result;
    }
  } catch (err) {
    const formatted = await formatError(err, { test: "paypalTest", step: "config" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    result.config = { success: false, error: formatted };
    return result;
  }

  // B) TOKEN CHECK
  try {
    const token = await getAccessToken();
    result.token = { success: true, tokenPreview: mask(token) };
  } catch (err) {
    const formatted = await formatError(err, { test: "paypalTest", step: "token" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    result.token = { success: false, error: formatted };
  }

  // C) CREATE ORDER CHECK
  try {
    const order = await createOrder({
      amount: 1.0,
      currency: "EUR",
      description: "Self-test order",
      metadata: "selftest",
    });
    result.createOrder = { success: !!order?.id, orderId: order?.id || null, status: order?.status || null };
  } catch (err) {
    const formatted = await formatError(err, { test: "paypalTest", step: "createOrder" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    result.createOrder = { success: false, error: formatted };
  }

  // D) SDK URL CHECK
  try {
    const clientId = process.env.PAYPAL_CLIENT_ID || "";
    const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId ? "masked" : "")}&currency=EUR&intent=capture`;

    // Use real client id for the request; only expose masked in responses/logs.
    const res = await fetch(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture`, {
      method: "GET",
      redirect: "manual",
    });

    const ok = res.status === 200 || res.status === 302;
    result.sdkUrl = { success: ok, status: res.status, url: sdkUrl };
    if (!ok) {
      const formatted = await formatError(
        { message: "Unexpected SDK response", status: res.status },
        { test: "paypalTest", step: "sdkUrl" }
      );
      console.error("🔴 SELF-TEST FAILURE", formatted);
      result.sdkUrl.error = formatted;
    }
  } catch (err) {
    const formatted = await formatError(err, { test: "paypalTest", step: "sdkUrl" });
    console.error("🔴 SELF-TEST FAILURE", formatted);
    result.sdkUrl = { success: false, error: formatted };
  }

  const allOk =
    result.config?.success &&
    result.token?.success &&
    result.createOrder?.success &&
    result.sdkUrl?.success;

  result.success = Boolean(allOk);
  return result;
}
