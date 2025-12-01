import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// HTML email template (liquid glass style)
function renderReceiptEmail({ email, pixels, amountEUR, purchaseId }) {
  return `
  <div style="
    background: #0a0c16;
    padding: 32px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
    color: white;
  ">
    <div style="
      max-width: 520px;
      margin: 0 auto;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      padding: 28px;
      border-radius: 20px;
      backdrop-filter: blur(18px);
    ">
      <h2 style="margin-top:0; font-size:22px;">Thank you for your purchase 🎉</h2>
      <p>Your pixels have been successfully added to the Million Pixel Board.</p>

      <div style="
        margin-top:24px;
        padding:16px;
        background: rgba(255,255,255,0.05);
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.1);
      ">
        <p style="margin:0;"><strong>Order ID:</strong> ${purchaseId}</p>
        <p style="margin:0;"><strong>Pixels purchased:</strong> ${pixels}</p>
        <p style="margin:0;"><strong>Total paid:</strong> € ${amountEUR}</p>
      </div>

      <p style="margin-top:22px;">
        You can manage or update your pixel image directly from your profile.
      </p>

      <p style="opacity:0.7; font-size:13px; margin-top:24px;">
        This message was sent automatically. If you did not perform this purchase, please contact us immediately.
      </p>
    </div>
  </div>
  `;
}

export async function sendPurchaseReceiptEmail({ email, pixels, amountEUR, purchaseId }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ No RESEND_API_KEY set — skipping receipt email");
    return;
  }

  try {
    const html = renderReceiptEmail({ email, pixels, amountEUR, purchaseId });

    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: email,
      subject: "Your Pixel Purchase Receipt",
      html,
    });

    console.log("📧 Purchase receipt email sent to:", email);
  } catch (err) {
    console.error("❌ Failed to send purchase email:", err);
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
