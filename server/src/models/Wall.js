// Mongoose model for MURO 1 walls tracking capacity and fill status.
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const wallSchema = new Schema(
  {
    wallId: { type: Number, unique: true, required: true },
    capacity: { type: Number, required: true, default: 67500 },
    filled: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "walls" }
);

wallSchema.index({ wallId: 1 });
wallSchema.index({ isActive: 1 }); // quick lookup of active wall

export const Wall = model("Wall", wallSchema);
