import Stripe from "stripe";
import Pixel from "../models/Pixel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const confirmPixelPurchase = async (req, res) => {
  try {
    const { session_id, payment_intent_id } = req.body;

    let metadata = null;

    if (session_id) {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (!session || session.payment_status !== "paid") {
        return res.status(400).json({ error: "Payment not completed" });
      }
      metadata = session.metadata;
    }

    if (!metadata && payment_intent_id) {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        return res.status(400).json({ error: "PaymentIntent not completed" });
      }
      metadata = paymentIntent.metadata;
    }

    if (!metadata) {
      return res.status(400).json({ error: "No metadata found" });
    }

    const pixelData = JSON.parse(metadata.pixelData || "[]");

    for (const p of pixelData) {
      await Pixel.findOneAndUpdate(
        { x: p.x, y: p.y },
        {
          purchased: true,
          imageUrl: p.imageUrl,
          title: p.title,
          linkUrl: p.linkUrl,
          nsfw: p.nsfw || false,
        },
        { upsert: true }
      );
    }

    const allPixels = await Pixel.find({});
    res.json({ success: true, grid: allPixels });
  } catch (err) {
    console.error("ERROR confirmPixelPurchase:", err);
    res.status(500).json({ error: "Server error" });
  }
};
