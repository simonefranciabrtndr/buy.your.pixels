import express from "express";
import { confirmPixelPurchase } from "../controllers/pixelController.js";

const router = express.Router();

router.post("/confirm", confirmPixelPurchase);

export default router;
