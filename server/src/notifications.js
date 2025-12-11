import { Resend } from "resend";
import { config } from "./config.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const fallbackNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatAmount = (value) => fallbackNumber(value, 0).toFixed(2);

function renderBaseEmailLayout({
  title,
  subtitle,
  contentHtml,
  primaryCtaLabel,
  primaryCtaHref,
  footerNote,
}) {
  const buttonHtml =
    primaryCtaLabel && primaryCtaHref
      ? `<div style="text-align:center;margin:20px 0;">
          <a href="${primaryCtaHref}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:linear-gradient(135deg,#4f9dff,#1e69e3);color:#fff;font-weight:700;text-decoration:none;box-shadow:0 6px 18px rgba(30,105,227,0.4);">${primaryCtaLabel}</a>
        </div>`
      : "";

  return `
  <div style="margin:0;padding:24px;background:#050816;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',Inter,sans-serif;color:#f5f7fb;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="background:radial-gradient(circle at top, rgba(255,255,255,0.06), rgba(5,8,22,0.96));border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;box-shadow:0 18px 55px rgba(0,0,0,0.75);backdrop-filter:blur(26px);">
        <div style="border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px 16px;background:rgba(255,255,255,0.02);">
          <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:6px;">${title || "yourpixels.online"}</div>
          <div style="font-size:15px;color:rgba(235,240,255,0.78);margin-bottom:14px;">${subtitle || ""}</div>
          <div style="font-size:14px;color:rgba(235,240,255,0.85);line-height:1.6;">${contentHtml || ""}</div>
          ${buttonHtml}
          <div style="font-size:12px;color:rgba(235,240,255,0.6);text-align:center;margin-top:14px;">
            ${footerNote || "You received this email because you interacted with yourpixels.online."}
          </div>
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

  const appBaseUrl = config.baseUrl || process.env.APP_BASE_URL || "https://yourpixels.online";

  try {
    const recipientEmail = email || profile?.email || purchase?.email;
    if (!recipientEmail) {
      console.warn("[mail] purchase receipt skipped; no recipient email");
      return;
    }
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

    const contentHtml = `
      <p style="margin:0 0 12px;">Hi ${username},</p>
      <p style="margin:0 0 14px;">Thank you for buying your digital space on yourpixels.online. Your pixels are now visible on the grid.</p>
      <div style="margin:12px 0;padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-weight:600;"><span>Order reference</span><span>${orderRef}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Purchase date</span><span>${purchaseDate}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Pixels purchased</span><span>${pixelCount.toLocaleString("en-US")}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Total amount</span><span>€${amountEur}</span></div>
      </div>
      <p style="margin:12px 0 0;">Feel free to update your placement anytime.</p>
    `;

    const html = renderBaseEmailLayout({
      title: "Your pixel purchase is confirmed ✨",
      subtitle: "Thank you for buying your digital space on yourpixels.online.",
      contentHtml,
      primaryCtaLabel: "View your pixels",
      primaryCtaHref: appBaseUrl,
      footerNote:
        "If you didn’t authorize this purchase, please reply to this email or contact support at support@yourpixels.online.",
    });

    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: recipientEmail,
      subject: "Your Pixel Purchase Receipt",
      html,
    });

    console.log("[mail] purchase receipt sent", { email: recipientEmail, orderRef });
  } catch (err) {
    console.error("[mail] purchase receipt failed", { email, orderRef: purchaseId, error: err.message });
  }
}

export async function sendPurchaseFailureEmail(profileOrUser, failureData = {}) {
  const appBaseUrl = config.baseUrl || process.env.APP_BASE_URL || "https://yourpixels.online";
  const recipientEmail = profileOrUser?.email;
  if (!recipientEmail) {
    console.warn("[mail] purchase failure email skipped; no recipient email");
    return;
  }
  const attemptedAmount = formatAmount(failureData.attemptedAmount);
  const pixelCount = fallbackNumber(failureData.pixelCount, 0);
  const errorCode = failureData.errorCode || "N/A";
  const errorMessage = failureData.errorMessage || "Unknown issue";

  const contentHtml = `
    <p style="margin:0 0 12px;">Hi ${profileOrUser?.username || "there"},</p>
    <p style="margin:0 0 12px;">We couldn’t complete your pixel purchase. No funds have been captured for this attempt.</p>
    <div style="margin:12px 0;padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Attempted amount</span><span>€${attemptedAmount}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Pixels</span><span>${pixelCount.toLocaleString("en-US")}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Reason</span><span>${errorCode} — ${errorMessage}</span></div>
    </div>
    <p style="margin:12px 0 0;">You can try again or use a different payment method.</p>
  `;

  try {
    const html = renderBaseEmailLayout({
      title: "Your pixel purchase didn’t complete",
      subtitle: "No funds have been captured for this attempt.",
      contentHtml,
      primaryCtaLabel: "Try again",
      primaryCtaHref: appBaseUrl,
      footerNote: "If you need help, contact support@yourpixels.online.",
    });

    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: recipientEmail,
      subject: "Pixel purchase attempt failed",
      html,
    });

    console.log("[mail] purchase failure email sent", { email: recipientEmail, attemptedAmount });
  } catch (err) {
    console.error("[mail] purchase failure email failed", { email: recipientEmail, error: err.message });
  }
}

export async function sendProfileWelcomeEmail(profile) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ No RESEND_API_KEY set — skipping welcome email");
    return;
  }

  const appBaseUrl = config.baseUrl || process.env.APP_BASE_URL || "https://yourpixels.online";
  const recipientEmail = profile?.email;
  if (!recipientEmail) {
    console.warn("[mail] welcome email skipped; no recipient email");
    return;
  }

  const username = profile?.username || recipientEmail.split("@")[0] || "there";

  const contentHtml = `
    <p style="margin:0 0 12px;">Hi ${username},</p>
    <p style="margin:0 0 12px;">Welcome to yourpixels.online! Thanks for creating a profile.</p>
    <p style="margin:0 0 12px;">Your future pixel purchases can be attached to this profile, and you can return anytime to manage your blocks, links, and uploads.</p>
    <p style="margin:0;">We’re excited to see what you build on the wall.</p>
  `;

  const html = renderBaseEmailLayout({
    title: "Welcome to Your Pixels ✨",
    subtitle: "Your new profile is ready.",
    contentHtml,
    primaryCtaLabel: "Open your profile",
    primaryCtaHref: appBaseUrl,
    footerNote: "You received this email because you created a profile on yourpixels.online.",
  });

  try {
    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: recipientEmail,
      subject: "Welcome to Your Pixels",
      html,
    });
    console.log("[mail] welcome email sent", { email: recipientEmail });
  } catch (err) {
    console.error("[mail] welcome email failed", { email: recipientEmail, error: err.message });
  }
}

export async function sendSupportAlertEmail(alertData = {}) {
  const recipient = process.env.SUPPORT_ALERT_EMAIL;
  if (!recipient) {
    console.warn("[mail] support alert skipped; SUPPORT_ALERT_EMAIL not set");
    return;
  }
  const {
    type,
    path,
    userId,
    profileId,
    email,
    orderRef,
    stripePaymentIntentId,
    stripeCheckoutSessionId,
    errorMessage,
    stack,
    additionalContext,
  } = alertData;

  const safeStack = stack ? String(stack).slice(0, 800) : undefined;
  const summary = {
    type,
    path,
    userId,
    profileId,
    email,
    orderRef,
    stripePaymentIntentId,
    stripeCheckoutSessionId,
    errorMessage,
    stack: safeStack,
    additionalContext,
  };

  const contentHtml = `
    <p style="margin:0 0 12px;">Type: ${type || "Unknown error"}</p>
    <p style="margin:0 0 12px;">Path: ${path || "N/A"}</p>
    <p style="margin:0 0 12px;">User: ${userId || profileId || email || "N/A"}</p>
    <p style="margin:0 0 12px;">Order/PI: ${orderRef || stripePaymentIntentId || stripeCheckoutSessionId || "N/A"}</p>
    <p style="margin:0 0 12px;">Error: ${errorMessage || "N/A"}</p>
    <pre style="margin:0;padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);white-space:pre-wrap;font-size:12px;">${JSON.stringify(summary, null, 2)}</pre>
  `;

  const html = renderBaseEmailLayout({
    title: "Backend alert on yourpixels.online",
    subtitle: `Alert type: ${type || "Unknown"}`,
    contentHtml,
    primaryCtaLabel: "",
    primaryCtaHref: "",
    footerNote:
      "You are receiving this message because you are configured as the alert recipient for yourpixels.online.",
  });

  try {
    await resend.emails.send({
      from: "Buy Your Pixels <noreply@yourpixels.online>",
      to: recipient,
      subject: `[yourpixels.online] Backend alert: ${type || "Unknown error"}`,
      html,
    });
    console.log("[mail] support alert sent", { to: recipient, type });
  } catch (err) {
    console.error("[mail] support alert failed", { to: recipient, error: err.message });
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
