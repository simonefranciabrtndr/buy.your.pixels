import express from "express";
import fetch from "node-fetch";
import { finalizePaidSession } from "../utils/finalizePaidSession.js";
import { getAccessToken } from "../paypalClient.js";

const getBaseUrl = () => {
  const env = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
};

const sanitizeError = (err) => ({
  message: err?.message || "Unknown error",
  name: err?.name || "Error",
  status: err?.status || err?.statusCode || null,
});

export function registerPayPalWebhook(app) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("[paypal-webhook] PAYPAL_WEBHOOK_ID not set; webhook disabled");
    return;
  }

  app.post("/api/webhooks/paypal", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const baseUrl = getBaseUrl();
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      req.rawBody = rawBody;
      let body = {};
      try {
        body = JSON.parse(rawBody.toString("utf8") || "{}");
      } catch {
        body = {};
      }

      const transmissionId = req.get("paypal-transmission-id");
      const transmissionTime = req.get("paypal-transmission-time");
      const transmissionSig = req.get("paypal-transmission-sig");
      const certUrl = req.get("paypal-cert-url");
      const authAlgo = req.get("paypal-auth-algo");

      const accessToken = await getAccessToken();
      const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: body,
        }),
      });

      const verifyJson = await verifyResponse.json().catch(() => ({}));
      if (verifyJson?.verification_status !== "SUCCESS") {
        console.error("[paypal-webhook] verification failed", sanitizeError(new Error("invalid signature")));
        return res.json({ received: true });
      }

      const event = body;
      const eventType = event?.event_type;

      if (eventType === "CHECKOUT.ORDER.APPROVED") {
        const orderId = event?.resource?.id;
        const payerEmail =
          event?.resource?.payer?.email_address ||
          event?.resource?.payment_source?.paypal?.email_address ||
          null;

        if (orderId) {
          try {
            const orderResp = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            const orderJson = await orderResp.json();
            const purchaseUnit = orderJson?.purchase_units?.[0];
            const capture = purchaseUnit?.payments?.captures?.[0];
            const captureStatus = capture?.status || orderJson?.status;
            const customId = purchaseUnit?.custom_id || purchaseUnit?.reference_id || null;

            if (captureStatus && ["COMPLETED", "CAPTURED"].includes(captureStatus.toUpperCase()) && customId) {
              const result = await finalizePaidSession({
                sessionId: customId,
                provider: "paypal",
                transactionId: capture?.id || orderId,
                payerEmail,
              });
              console.log("[paypal-webhook] finalize result", result);
            }
          } catch (err) {
            console.error("[paypal-webhook] order fetch error", sanitizeError(err));
          }
        }
      }
    } catch (err) {
      console.error("[paypal-webhook] handler error", sanitizeError(err));
    }

    res.json({ received: true });
  });
}
