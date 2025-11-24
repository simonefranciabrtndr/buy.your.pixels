import express from "express";
import bcrypt from "bcryptjs";
import {
  createUser,
  createUserFromProvider,
  findUserByEmail,
  findUserById,
  findUserByProvider,
} from "../userStore.js";
import { issueAuthCookie, clearAuthCookie } from "../middleware/auth.js";

const router = express.Router();

const normalizeEmail = (value = "") => value.trim().toLowerCase();
const isValidEmail = (email = "") => /\S+@\S+\.\S+/.test(email);
const isValidPassword = (password = "") => password.length >= 8;
const buildUrl = (base, params) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value !== "undefined" && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

const successRedirect = process.env.AUTH_SUCCESS_REDIRECT_URL || "/";
const errorRedirect = process.env.AUTH_ERROR_REDIRECT_URL || "/?auth=error";

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

const buildProviderUrl = (provider) => {
  switch (provider) {
    case "google": {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;
      if (!clientId || !redirectUri) return null;
      return buildUrl("https://accounts.google.com/o/oauth2/v2/auth", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        prompt: "select_account",
        access_type: "offline",
      });
    }
    case "apple": {
      const clientId = process.env.APPLE_CLIENT_ID;
      const redirectUri = process.env.APPLE_REDIRECT_URI;
      if (!clientId || !redirectUri) return null;
      return buildUrl("https://appleid.apple.com/auth/authorize", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: "name email",
      });
    }
    case "discord": {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const redirectUri = process.env.DISCORD_REDIRECT_URI;
      if (!clientId || !redirectUri) return null;
      return buildUrl("https://discord.com/api/oauth2/authorize", {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify email",
        prompt: "consent",
      });
    }
    default:
      return null;
  }
};

const buildProviderHandlers = [
  { key: "google" },
  { key: "apple" },
  { key: "discord" },
];

buildProviderHandlers.forEach(({ key }) => {
  router.get(`/${key}/url`, (req, res) => {
    const url = buildProviderUrl(key);
    if (!url) {
      return res.json({ url: null, error: `${key} OAuth not configured` });
    }
    return res.json({ url });
  });
});

const fetchProviderProfile = async (provider, code) => {
  // Placeholder for real OAuth exchange.
  // TODO: Exchange `code` for tokens and fetch user profile from provider APIs.
  return {
    providerId: `stub-${provider}-${code}`,
    email: null,
  };
};

const handleProviderCallback = (provider) => {
  return async (req, res) => {
    const code = req.query?.code;
    if (!code) {
      return res.redirect(errorRedirect);
    }
    try {
      const profile = await fetchProviderProfile(provider, code);
      if (!profile?.providerId) {
        return res.redirect(errorRedirect);
      }
      let existing = await findUserByProvider(provider, profile.providerId);
      if (!existing?.user) {
        const created = await createUserFromProvider({
          provider,
          providerId: profile.providerId,
          email: profile.email,
        });
        existing = { user: created };
      }
      issueAuthCookie(res, { userId: existing.user.id, email: existing.user.email });
      return res.redirect(successRedirect);
    } catch (error) {
      console.error(`${provider} OAuth error`, error);
      return res.redirect(errorRedirect);
    }
  };
};

buildProviderHandlers.forEach(({ key }) => {
  router.get(`/${key}/callback`, handleProviderCallback(key));
});

export default router;
