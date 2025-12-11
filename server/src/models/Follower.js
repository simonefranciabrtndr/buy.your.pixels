// Mongoose model for MURO 1 followers placed on the free wall grid.
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const followerSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    platform: { type: String, required: true, enum: ["instagram", "tiktok"] },
    profileUrl: { type: String, required: true, trim: true },
    avatarUrl: { type: String, required: true, trim: true },
    wallId: { type: Number, required: true, index: true },
    slotIndex: { type: Number, required: true },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    isNew: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "followers" }
);

// Unique slot per wall ensures deterministic placement on the grid.
followerSchema.index({ wallId: 1, slotIndex: 1 }, { unique: true });

export const Follower = model("Follower", followerSchema);
