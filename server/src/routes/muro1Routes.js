// Express router for MURO 1 (free wall) endpoints backed by MongoDB.
import express from "express";
import { Follower } from "../models/Follower.js";
import { Wall } from "../models/Wall.js";
import { Stats } from "../models/Stats.js";
import { assignNextSlot, getActiveWall, updateStatsOnNewFollower } from "../services/wallService.js";

const router = express.Router();

const isValidPlatform = (value) => value === "instagram" || value === "tiktok";
const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

router.get("/wall/:wallId", async (req, res) => {
  try {
    const wallId = Number(req.params.wallId);
    if (!Number.isFinite(wallId)) {
      return res.status(400).json({ error: "Invalid wall id" });
    }

    const followers = await Follower.find({ wallId }).sort({ slotIndex: 1 });
    return res.json({ wallId, followers });
  } catch (err) {
    console.error("[muro1] get wall failed", err);
    return res.status(500).json({ error: "Unable to load wall" });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    let stats = await Stats.findOne({ statsId: 1 });
    if (!stats) {
      const followersCount = await Follower.countDocuments();
      const wallsActive = await Wall.countDocuments();
      stats = await Stats.findOneAndUpdate(
        { statsId: 1 },
        {
          $set: {
            statsId: 1,
            totalPixels: 1_080_000,
            followersCount,
            spotsFilled: followersCount,
            wallsActive,
            lastFollower: "",
            updatedAt: new Date(),
          },
        },
        { new: true, upsert: true }
      );
    }
    return res.json({ stats });
  } catch (err) {
    console.error("[muro1] get stats failed", err);
    return res.status(500).json({ error: "Unable to load stats" });
  }
});

router.post("/followers/add", async (req, res) => {
  try {
    const { username, platform, profileUrl, avatarUrl } = req.body || {};
    if (!isNonEmpty(username) || !isValidPlatform(platform) || !isNonEmpty(profileUrl) || !isNonEmpty(avatarUrl)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const slotInfo = await assignNextSlot();
    const follower = await Follower.create({
      username: username.trim(),
      platform,
      profileUrl: profileUrl.trim(),
      avatarUrl: avatarUrl.trim(),
      wallId: slotInfo.wallId,
      slotIndex: slotInfo.slotIndex,
      position: slotInfo.position,
      isNew: true,
    });

    await updateStatsOnNewFollower(follower);

    return res.status(201).json({ follower });
  } catch (err) {
    console.error("[muro1] add follower failed", err);
    return res.status(500).json({ error: "Unable to add follower" });
  }
});

router.post("/followers/batch", async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.followers) ? req.body.followers : [];
    if (!entries.length) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const docs = [];
    let firstSlotIndex = null;
    let lastSlotIndex = null;
    const wallIdsUsed = new Set();

    for (const entry of entries) {
      const { username, platform, profileUrl, avatarUrl } = entry || {};
      if (!isNonEmpty(username) || !isValidPlatform(platform) || !isNonEmpty(profileUrl) || !isNonEmpty(avatarUrl)) {
        return res.status(400).json({ error: "Invalid input" });
      }

      const slotInfo = await assignNextSlot();
      wallIdsUsed.add(slotInfo.wallId);
      if (firstSlotIndex === null) firstSlotIndex = slotInfo.slotIndex;
      lastSlotIndex = slotInfo.slotIndex;

      docs.push({
        username: username.trim(),
        platform,
        profileUrl: profileUrl.trim(),
        avatarUrl: avatarUrl.trim(),
        wallId: slotInfo.wallId,
        slotIndex: slotInfo.slotIndex,
        position: slotInfo.position,
        isNew: true,
      });
    }

    const inserted = await Follower.insertMany(docs);
    if (inserted.length) {
      await updateStatsOnNewFollower(inserted[inserted.length - 1]);
    }

    return res.status(201).json({
      insertedCount: inserted.length,
      wallIds: Array.from(wallIdsUsed),
      firstSlotIndex,
      lastSlotIndex,
    });
  } catch (err) {
    console.error("[muro1] batch add followers failed", err);
    return res.status(500).json({ error: "Unable to add followers batch" });
  }
});

router.post("/walls/new", async (_req, res) => {
  try {
    const latest = await Wall.findOne().sort({ wallId: -1 });
    const nextWallId = latest ? latest.wallId + 1 : 1;

    const wall = await Wall.create({
      wallId: nextWallId,
      capacity: 67_500,
      filled: 0,
      isActive: true,
    });

    return res.status(201).json({ wall });
  } catch (err) {
    console.error("[muro1] create wall failed", err);
    return res.status(500).json({ error: "Unable to create wall" });
  }
});

// Optional helper to fetch the current active wall (not required by spec but handy)
router.get("/wall/active/current", async (_req, res) => {
  try {
    const wall = await getActiveWall();
    return res.json({ wall });
  } catch (err) {
    console.error("[muro1] get active wall failed", err);
    return res.status(500).json({ error: "Unable to load active wall" });
  }
});

export default router;
