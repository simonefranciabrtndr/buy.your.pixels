import fetch from "node-fetch";

export async function emailTest() {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TEST_EMAIL_TO || "simone.francia.brtdnr@gmail.com";
  const from = "Buy Your Pixels <noreply@yourpixels.online>";

  const start = Date.now();

  if (!apiKey) {
    return {
      success: false,
      error: {
        message: "Missing RESEND_API_KEY",
        keyLoaded: false,
      },
      duration_ms: Date.now() - start,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Self-Test Email — Buy Your Pixels",
        html: "<p>Self-test email OK.</p>",
      }),
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (!response.ok) {
      console.error("[SELFTEST:EMAIL] FAILURE", {
        status: response.status,
        body: data,
      });

      return {
        success: false,
        status: response.status,
        response: data,
        error: "Email send failed",
        duration_ms: duration,
      };
    }

    return {
      success: true,
      details: {
        id: data.id,
        to,
        from,
      },
      duration_ms: duration,
    };
  } catch (err) {
    return {
      success: false,
      error: {
        message: err.message,
        stack: err.stack,
      },
      duration_ms: Date.now() - start,
    };
  }
}
