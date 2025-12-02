import { config } from "../config.js";

const randomId = () => Math.random().toString(36).slice(2, 10);

export async function sendMetaPurchaseEvent({
  value,
  currency,
  eventId,
  clientIp,
  userAgent,
  sourceUrl,
}) {
  const { pixelId, accessToken, testEventCode, apiBaseUrl } = config.meta || {};
  if (!pixelId || !accessToken) {
    console.warn("[meta] missing config; skipping CAPI");
    return;
  }

  const urlBase = (apiBaseUrl || "https://graph.facebook.com/v18.0").replace(/\/$/, "");
  const url = `${urlBase}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId || randomId(),
        action_source: "website",
        event_source_url: sourceUrl || `${config.baseUrl || "https://yourpixels.online"}/success`,
        user_data: {
          client_ip_address: clientIp || undefined,
          client_user_agent: userAgent || undefined,
        },
        custom_data: {
          currency: currency || "EUR",
          value: Number(value || 0) || 0,
        },
      },
    ],
    test_event_code: testEventCode || undefined,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseBody = await response.text();
    if (!response.ok) {
      console.error("[meta] purchase event error", { status: response.status, body: responseBody });
      return;
    }
    console.log("[meta] purchase event sent", {
      eventId: body.data[0].event_id,
      value: body.data[0].custom_data.value,
      currency: body.data[0].custom_data.currency,
      status: response.status,
    });
  } catch (error) {
    console.error("[meta] purchase event error", { error: error.message });
  }
}
