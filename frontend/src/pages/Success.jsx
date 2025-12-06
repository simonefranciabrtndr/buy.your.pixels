import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import "./Success.css";

const isFiniteNumber = (val) => Number.isFinite(Number(val));

const sanitizeRect = (rect) => {
  if (!rect || typeof rect !== "object") return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if ([x, y, w, h].some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return { x, y, w, h };
};

const sanitizeTiles = (tiles, fallbackRect) => {
  const arr = Array.isArray(tiles) ? tiles : [];
  const cleaned = arr
    .map(sanitizeRect)
    .filter(Boolean);
  if (cleaned.length) return cleaned;
  if (fallbackRect) return [fallbackRect];
  return [];
};

const sanitizeLink = (link) => {
  if (!link || typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
};

const sanitizeUploadedImage = (value) => {
  if (!value || typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  const unsafe =
    lowered.includes("<script") ||
    lowered.includes("<svg") ||
    lowered.includes("<html") ||
    lowered.includes("javascript:") ||
    lowered.startsWith("data:text/html") ||
    lowered.startsWith("data:text/svg");
  if (unsafe) return null;
  return value;
};

export default function SuccessPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [saveMessage, setSaveMessage] = useState(null);
  const saveAttemptedRef = useRef(false);
  const stateData = location.state || {};
  const orderId = params.get("order");
  const queryValue = params.get("value");
  const queryPixels = params.get("pixels");

  const { totalEUR, pixelCount, transactionId } = useMemo(() => {
    const txId = stateData.orderId || orderId || params.get("transaction_id") || null;
    const value =
      typeof stateData.value === "number"
        ? stateData.value
        : queryValue
        ? Number(queryValue)
        : null;
    const pixels =
      typeof stateData.pixels === "number"
        ? stateData.pixels
        : queryPixels
        ? Number(queryPixels)
        : null;
    return {
      totalEUR: Number.isFinite(value) ? value : null,
      pixelCount: Number.isFinite(pixels) ? pixels : null,
      transactionId: txId,
    };
  }, [stateData, orderId, params, queryValue, queryPixels]);

  // Fire tracking events (Meta + GA4)
  useEffect(() => {
    const valueToSend = Number.isFinite(totalEUR) ? totalEUR : 0;
    const qty = Number.isFinite(pixelCount) ? pixelCount : 1;

    if (typeof window !== "undefined" && typeof window.gtag === "function" && transactionId) {
      window.gtag("event", "purchase", {
        transaction_id: transactionId,
        value: valueToSend,
        currency: "EUR",
        items: [
          {
            item_id: "pixel_block",
            item_name: "Pixel Purchase",
            quantity: qty,
          },
        ],
      });
    }

    if (typeof window !== "undefined" && typeof window.fbq === "function" && transactionId) {
      window.fbq("track", "Purchase", {
        value: valueToSend,
        currency: "EUR",
        contents: [
          {
            id: "pixel_block",
            quantity: qty,
          },
        ],
      });
    }
  }, [totalEUR, pixelCount, transactionId]);

  const orderRef = transactionId || params.get("orderRef") || "#ThankYou";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pi = params.get("payment_intent");
    const clientSecret = params.get("payment_intent_client_secret");
    const redirectStatus = params.get("redirect_status");
    const sessionId = params.get("session");

    console.info("[success] callback params:", {
      pi,
      clientSecret,
      redirectStatus,
      sessionId,
    });

    // If Revolut Pay redirected us
    if (redirectStatus === "succeeded" && pi) {
      // Optionally notify backend
      fetch("/api/purchases/confirm-redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          paymentIntentId: pi,
          sessionId: sessionId || null,
        }),
      }).catch(() => {});

      console.info("[success] Revolut Pay confirmed");
    }
  }, []);

  const parseJsonParam = (key) => {
    const raw = params.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  };

  useEffect(() => {
    if (saveAttemptedRef.current) return;
    if (!orderId) return;

    const selectionRaw = typeof window !== "undefined" ? localStorage.getItem("yp_last_selection") : null;
    let selection = null;
    try {
      selection = selectionRaw ? JSON.parse(selectionRaw) : null;
    } catch {
      selection = null;
    }

    const paramRect = parseJsonParam("rect");
    const paramTiles = parseJsonParam("tiles");
    const paramPreview = parseJsonParam("preview");
    const paramTransform = parseJsonParam("imageTransform");
    const paramUpload = parseJsonParam("uploadedImage");
    const paramLink = params.get("link");

    const rect = sanitizeRect(selection?.rect) || sanitizeRect(paramRect);
    const tiles = sanitizeTiles(selection?.tiles || paramTiles, rect);
    const areaVal = Number(
      selection?.area ??
        paramRect?.area ??
        paramTiles?.area ??
        queryPixels ??
        params.get("area") ??
        0
    );
    const priceVal = Number(
      Number.isFinite(totalEUR) ? totalEUR : selection?.price ?? queryValue ?? 0
    );

    const link = sanitizeLink(selection?.link || paramLink);
    const uploadedImage = sanitizeUploadedImage(selection?.uploadedImage || paramUpload);
    const imageTransform = selection?.imageTransform || paramTransform || null;
    const previewData = selection?.previewData || paramPreview || null;

    if (!rect || !tiles.length || !isFiniteNumber(areaVal) || areaVal <= 0 || !isFiniteNumber(priceVal)) {
      setSaveMessage("Purchase saved, but automatic grid update failed.");
      return;
    }

    saveAttemptedRef.current = true;

    const payload = {
      id: orderId,
      rect,
      tiles,
      area: areaVal,
      price: priceVal,
      link,
      uploadedImage,
      imageTransform,
      previewData,
      provider: "paypal",
    };

    // eslint-disable-next-line no-console
    console.log("[success] purchase payload", payload);

    const submit = async () => {
      try {
        const res = await fetch("https://api.yourpixels.online/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await res.json().catch(() => ({}));
          if (typeof window !== "undefined") {
            localStorage.removeItem("yp_last_selection");
          }
          setSaveMessage(null);
        } else {
          setSaveMessage("Purchase saved, but automatic grid update failed.");
        }
      } catch {
        setSaveMessage("Purchase saved, but automatic grid update failed.");
      }
    };

    submit();
  }, [orderId, params, queryPixels, queryValue, totalEUR]);

  return (
    <div className="success-page">
      <div className="success-overlay" />
      <div className="success-card">
        <div className="success-icon">
          <span>✓</span>
        </div>
        <h1 className="success-title">Payment successful</h1>
        <p className="success-subtitle">Your pixels are now live on the Wall.</p>

        <div className="success-summary">
          <div className="summary-item">
            <div className="summary-label">Order ref</div>
            <div className="summary-value">{orderRef}</div>
          </div>
          {Number.isFinite(totalEUR) && (
            <div className="summary-item">
              <div className="summary-label">Total paid</div>
              <div className="summary-value">€{totalEUR.toFixed(2)}</div>
            </div>
          )}
          {Number.isFinite(pixelCount) && (
            <div className="summary-item">
              <div className="summary-label">Pixels</div>
              <div className="summary-value">{Math.round(pixelCount).toLocaleString()}</div>
            </div>
          )}
        </div>
        {saveMessage && <p className="success-subtitle">{saveMessage}</p>}

        <div className="success-actions">
          <a className="btn-primary" href="https://yourpixels.online">
            View your pixels
          </a>
          <button className="btn-secondary" onClick={() => navigate("/", { replace: true })}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
