import express from "express";
import { claimPurchasesByToken } from "../profileStore.js";

const router = express.Router();

router.post("/claim-purchases", async (req, res) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const claimToken = req.body?.claimToken;
    if (!claimToken) {
      return res.status(400).json({ error: "Missing claim token" });
    }

    const result = await claimPurchasesByToken({
      email: req.user.email,
      claimToken,
    });

    if (!result.claimedCount) {
      return res.status(404).json({ error: "No purchases found for this claim token" });
    }

    return res.json({
      ok: true,
      claimedCount: result.claimedCount,
      profile: result.profile,
    });
  } catch (err) {
    console.error("Claim purchases error:", err);
    return res.status(500).json({ error: "Unable to claim purchases" });
  }
});

export default router;
