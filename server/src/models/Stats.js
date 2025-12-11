// Aggregated stats document for MURO 1 (single row with statsId=1).
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const statsSchema = new Schema(
  {
    statsId: { type: Number, unique: true, default: 1 },
    totalPixels: { type: Number, default: 1_080_000 }, // 1200 * 900
    followersCount: { type: Number, default: 0 },
    spotsFilled: { type: Number, default: 0 },
    wallsActive: { type: Number, default: 1 },
    lastFollower: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "stats" }
);

statsSchema.index({ statsId: 1 });

export const Stats = model("Stats", statsSchema);
