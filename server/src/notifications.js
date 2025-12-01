import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const fallbackNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatAmount = (value) => fallbackNumber(value, 0).toFixed(2);

// HTML email template (liquid glass style)
function renderReceiptEmail({ orderRef, purchaseDate, pixels, amountEur, username }) {
  return `
  <div style="margin:0;padding:24px;background:#050816;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',Inter,sans-serif;color:#f5f7fb;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:74px;height:74px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#1ee0a1,#0f9ad8);box-shadow:0 0 25px rgba(15,154,216,0.35),0 10px 30px rgba(0,0,0,0.45);color:#fff;font-size:32px;font-weight:700;">✓</div>
        <div style="margin-top:14px;font-size:22px;font-weight:600;letter-spacing:0.2px;">Buy Your Pixels</div>
      </div>

      <div style="background:rgba(12,18,32,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;box-shadow:0 18px 55px rgba(0,0,0,0.75);backdrop-filter:blur(26px);">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:20px;font-weight:700;color:#ffffff;margin-bottom:6px;">Payment successful</div>
          <div style="font-size:15px;color:rgba(235,240,255,0.78);">Your pixels are now live on the Wall.</div>
        </div>
        <div style="font-size:14px;color:rgba(235,240,255,0.8);text-align:center;margin-bottom:14px;">Hi ${username || "there"}, thanks for supporting Buy Your Pixels.</div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0;padding:14px 12px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;letter-spacing:0.3px;color:rgba(230,235,255,0.6);text-transform:uppercase;margin-bottom:4px;">Order Ref</div>
            <div style="font-size:16px;font-weight:600;color:#ffffff;">${orderRef}</div>
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;letter-spacing:0.3px;color:rgba(230,235,255,0.6);text-transform:uppercase;margin-bottom:4px;">Date</div>
            <div style="font-size:16px;font-weight:600;color:#ffffff;">${purchaseDate}</div>
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;letter-spacing:0.3px;color:rgba(230,235,255,0.6);text-transform:uppercase;margin-bottom:4px;">Pixels</div>
            <div style="font-size:16px;font-weight:600;color:#ffffff;">${pixels.toLocaleString("en-US")}</div>
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;letter-spacing:0.3px;color:rgba(230,235,255,0.6);text-transform:uppercase;margin-bottom:4px;">Total</div>
            <div style="font-size:16px;font-weight:700;color:#1ee0a1;">€ ${formatAmount(amountEur)}</div>
          </div>
        </div>

        <div style="text-align:center;margin:20px 0;">
          <a href="https://yourpixels.online/" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#4f9dff,#1e69e3);color:#fff;font-weight:700;text-decoration:none;box-shadow:0 6px 18px rgba(30,105,227,0.4);">View your pixels</a>
        </div>

        <div style="font-size:13px;color:rgba(235,240,255,0.7);text-align:center;margin-top:10px;">
          If you didn’t make this purchase, please contact us at <a href="mailto:support@yourpixels.online" style="color:#7bc6ff;text-decoration:none;">support@yourpixels.online</a>.
        </div>
      </div>
    </div>
  </div>
  `;
}

export async function sendPurchaseReceiptEmail({ email, pixels, amountEUR, purchaseId, profile, purchase }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ No RESEND_API_KEY set — skipping receipt email");
    return;
  }

  try {
    const recipientEmail = email || profile?.email || purchase?.email || "unknown";
    const username = profile?.username || purchase?.username || "there";
    const pixelCount =
      fallbackNumber(purchase?.area?.area, null) ??
      fallbackNumber(purchase?.area, null) ??
      (purchase?.rect ? fallbackNumber(purchase.rect.w * purchase.rect.h, 0) : fallbackNumber(pixels, 0));
    const amountEur = formatAmount(purchase?.price ?? amountEUR);
    const shortId = purchase?.id ? String(purchase.id).slice(0, 8).toUpperCase() : Date.now().toString(36).toUpperCase();
    const orderRef = purchase?.id ? `YP-${shortId}` : `YP-${shortId}`;
    const purchaseDate = new Date(purchase?.createdAt || purchase?.created_at || Date.now()).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    console.log("[notifications] Sending purchase receipt email", {
      to: recipientEmail,
      orderRef,
      pixels: pixelCount,
      amountEur,
      username,
    });

    const html = renderReceiptEmail({
      orderRef,
      purchaseDate,
      pixels: pixelCount,
      amountEur,
      username,
    });

    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: recipientEmail,
      subject: "Your Pixel Purchase Receipt",
      html,
    });

    console.log("[notifications] Purchase receipt email sent", { to: recipientEmail, orderRef });
  } catch (err) {
    console.error("[notifications] Failed to send purchase receipt email", err);
  }
}

export async function sendTestEmail(to) {
  const html = `
  <style>
    .card {
      width: 100%;
      max-width: 460px;
      margin: 40px auto;
      padding: 32px;
      background: rgba(20, 20, 28, 0.55);
      backdrop-filter: blur(18px);
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 0 35px rgba(244,184,106,0.28);
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #f7f7f7;
    }
    h1 {
      font-size: 26px;
      margin-bottom: 12px;
      color: #ffffff;
      font-weight: 600;
    }
    p {
      font-size: 16px;
      line-height: 1.5;
      color: #d4d4d4;
    }
    .footer {
      margin-top: 28px;
      font-size: 12px;
      opacity: 0.6;
      text-align: center;
    }
  </style>

  <div class="card">
    <h1>✨ Test Email — Buy Your Pixels</h1>
    <p>
      This is a <strong>test message</strong> confirming that your email service is correctly configured.
    </p>
    <p>
      Everything looks great — your Resend transactional emails will match the
      exact visual style of your pixel purchase confirmations.
    </p>
    <div class="footer">yourpixels.online</div>
  </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to,
      subject: "Test Email — Buy Your Pixels",
      html,
    });

    if (error) throw error;
    console.log("📨 Test email sent:", data?.id);
    return data;
  } catch (err) {
    console.error("❌ Error sending test email:", err);
    throw err;
  }
}
