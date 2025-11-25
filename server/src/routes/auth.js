import express from "express";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByProvider,
  createUserFromProvider,
} from "../userStore.js";
import { issueAuthCookie, clearAuthCookie } from "../middleware/auth.js";
import {
  getGoogleAuthURL,
  handleGoogleCallback,
  getAppleAuthURL,
  handleAppleCallback,
} from "../services/oauth.js";

const router = express.Router();

const normalizeEmail = (value = "") => value.trim().toLowerCase();
const isValidEmail = (email = "") => /\S+@\S+\.\S+/.test(email);
const isValidPassword = (password = "") => password.length >= 8;
const SOCIAL_SUCCESS_REDIRECT = process.env.AUTH_SUCCESS_REDIRECT_URL || "https://yourpixels.online/social-login";
console.log("🔥 AUTH_REDIRECT_TARGET =", SOCIAL_SUCCESS_REDIRECT);
const ERROR_REDIRECT = process.env.AUTH_ERROR_REDIRECT_URL || "/?auth=error";

const ensureOAuthUser = async (provider, email) => {
  const providerId = email || `${provider}-${Date.now()}`;
  const existing = await findUserByProvider(provider, providerId);
  if (existing?.user) {
    return existing.user;
  }
  return createUserFromProvider({
    provider,
    providerId,
    email,
  });
};

const redirectWithToken = (res, user) => {
  const token = issueAuthCookie(res, { userId: user.id, email: user.email });
  const joiner = SOCIAL_SUCCESS_REDIRECT.includes("?") ? "&" : "?";
  const destination = `${SOCIAL_SUCCESS_REDIRECT}${joiner}token=${encodeURIComponent(token)}`;
  return res.redirect(destination);
};


router.post("/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || "");
    const password = req.body?.password || "";

    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const existing = await findUserByEmail(email);
    if (existing?.user) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, passwordHash, provider: "local" });
    return res.status(201).json({ id: user.id, email: user.email, createdAt: user.createdAt });
  } catch (error) {
    console.error("Register error", error);
    return res.status(500).json({ error: "Unable to register user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || "");
    const password = req.body?.password || "";
    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const existing = await findUserByEmail(email);
    if (!existing?.raw) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const matches = await bcrypt.compare(password, existing.raw.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    issueAuthCookie(res, { userId: existing.user.id, email: existing.user.email });
    return res.json({ id: existing.user.id, email: existing.user.email });
  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({ error: "Unable to login" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.json({ user: null });
    }
    const existing = await findUserById(req.user.id);
    if (!existing?.user) {
      return res.json({ user: null });
    }
    return res.json({
      user: {
        id: existing.user.id,
        email: existing.user.email,
        provider: existing.user.provider,
        createdAt: existing.user.createdAt,
      },
    });
  } catch (error) {
    console.error("Fetch current user error", error);
    return res.json({ user: null });
  }
});

router.get("/google", async (_req, res) => {
  try {
    const url = await getGoogleAuthURL();
    return res.json({ url });
  } catch (error) {
    console.error("Google auth URL error", error);
    return res.json({ url: null });
  }
});

router.get("/apple", async (_req, res) => {
  try {
    const url = await getAppleAuthURL();
    return res.json({ url });
  } catch (error) {
    console.error("Apple auth URL error", error);
    return res.json({ url: null });
  }
});

router.get("/google/callback", async (req, res) => {
  const code = req.query?.code;
  if (!code) {
    return res.redirect(ERROR_REDIRECT);
  }
  try {
    const profile = await handleGoogleCallback(code);
    const user = await ensureOAuthUser("google", profile?.email || null);
    console.log("🔥 Google callback completed — redirecting user to:", SOCIAL_SUCCESS_REDIRECT);
    return redirectWithToken(res, user);
  } catch (error) {
    console.error("Google OAuth callback error", error);
    return res.redirect(ERROR_REDIRECT);
  }
});

router.post("/apple/callback", async (req, res) => {
  const code = req.body?.code || req.query?.code;
  if (!code) {
    return res.redirect(ERROR_REDIRECT);
  }
  try {
    const profile = await handleAppleCallback(code);
    const user = await ensureOAuthUser("apple", profile?.email || null);
    return redirectWithToken(res, user);
  } catch (error) {
    console.error("Apple OAuth callback error", error);
    return res.redirect(ERROR_REDIRECT);
  }
});

export default router;
