// Core placement and stats helpers for MURO 1 (MongoDB-backed free wall).
import { Follower } from "../models/Follower.js";
import { Wall } from "../models/Wall.js";
import { Stats } from "../models/Stats.js";

const SLOTS_PER_ROW = 300; // 1200 / 4
const BLOCK_SIZE = 4; // Each follower occupies 4x4 micro-cells
const CAPACITY_PER_WALL = 67_500; // 300 * 225

// Find the active wall or create wall #1 if none exists.
export async function getActiveWall() {
  const existing = await Wall.findOne({ isActive: true });
  if (existing) return existing;

  const created = await Wall.create({
    wallId: 1,
    capacity: CAPACITY_PER_WALL,
    filled: 0,
    isActive: true,
  });
  return created;
}

// Compute the top-left position (micro-cells) for a given slot index on the grid.
export function computeFollowerPosition(slotIndex) {
  const slotX = slotIndex % SLOTS_PER_ROW;
  const slotY = Math.floor(slotIndex / SLOTS_PER_ROW);
  return {
    x: slotX * BLOCK_SIZE,
    y: slotY * BLOCK_SIZE,
  };
}

// Reserve next available slot; if full, roll over to a new wall.
export async function assignNextSlot() {
  let wall = await getActiveWall();

  if (wall.filled >= wall.capacity) {
    wall.isActive = false;
    await wall.save();

    const newWallId = wall.wallId + 1;
    wall = await Wall.create({
      wallId: newWallId,
      capacity: CAPACITY_PER_WALL,
      filled: 0,
      isActive: true,
    });
  }

  const slotIndex = wall.filled;
  const position = computeFollowerPosition(slotIndex);

  wall.filled = wall.filled + 1;
  await wall.save();

  return {
    wallId: wall.wallId,
    slotIndex,
    position,
  };
}

// Update aggregated stats whenever a new follower is added.
export async function updateStatsOnNewFollower(followerDocument) {
  const followersCount = await Follower.countDocuments();
  const wallsActive = await Wall.countDocuments();

  await Stats.findOneAndUpdate(
    { statsId: 1 },
    {
      $set: {
        totalPixels: 1_080_000,
        followersCount,
        spotsFilled: followersCount,
        wallsActive,
        lastFollower: followerDocument?.username ? `@${followerDocument.username}` : "",
        updatedAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );
}
