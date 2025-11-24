import express from "express";
import bcrypt from "bcryptjs";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import {
  createUser,
  createUserFromProvider,
  findUserByEmail,
  findUserById,
  findUserByProvider,
  findOrCreateOAuthUser as userStoreFindOrCreateOAuthUser,
} from "../userStore.js";
import { issueAuthCookie, clearAuthCookie } from "../middleware/auth.js";
import {
  getGoogleAuthURL,
  getGoogleUser,
  getDiscordAuthURL,
  getDiscordUser,
  getAppleAuthURL,
  getAppleUser,
} from "../services/oauth.js";

const router = express.Router();

const normalizeEmail = (value = "") => value.trim().toLowerCase();
const isValidEmail = (email = "") => /\S+@\S+\.\S+/.test(email);
const isValidPassword = (password = "") => password.length >= 8;
const SOCIAL_SUCCESS_REDIRECT = process.env.AUTH_SUCCESS_REDIRECT_URL || "https://yourpixels.online/social-login";
const ERROR_REDIRECT = process.env.AUTH_ERROR_REDIRECT_URL || "/?auth=error";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

const fallbackFindOrCreateOAuthUser = async (provider, profile) => {
  const existing = await findUserByProvider(provider, profile.providerId);
  if (existing?.user) {
    return existing.user;
  }
  return createUserFromProvider({
    provider,
    providerId: profile.providerId,
    email: profile.email,
  });
};

const findOrCreateOAuthUser = userStoreFindOrCreateOAuthUser || fallbackFindOrCreateOAuthUser;

const redirectWithToken = (res, user) => {
  const token = issueAuthCookie(res, { userId: user.id, email: user.email });
  const joiner = SOCIAL_SUCCESS_REDIRECT.includes("?") ? "&" : "?";
  const destination = `${SOCIAL_SUCCESS_REDIRECT}${joiner}token=${encodeURIComponent(token)}`;
  return res.redirect(destination);
};

const decodeJwtPayload = (token = "") => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(padded, "base64");
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
};

const postForm = async (url, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "OAuth token exchange failed");
  }
  return response.json();
};

const exchangeGoogleCode = async (code) => {
  const payload = {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  };
  return postForm(GOOGLE_TOKEN_URL, payload);
};

const exchangeDiscordCode = async (code) => {
  const payload = {
    code,
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    grant_type: "authorization_code",
  };
  return postForm(DISCORD_TOKEN_URL, payload);
};

const createAppleClientSecret = () => {
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !clientId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: teamId,
      iat: now,
      exp: now + 60 * 5,
      aud: "https://appleid.apple.com",
      sub: clientId,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: { kid: keyId },
    }
  );
};

const exchangeAppleCode = async (code) => {
  const clientSecret = createAppleClientSecret();
  if (!clientSecret) {
    throw new Error("Apple credentials not configured");
  }
  const payload = {
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.APPLE_REDIRECT_URI,
    client_id: process.env.APPLE_CLIENT_ID,
    client_secret: clientSecret,
  };
  return postForm(APPLE_TOKEN_URL, payload);
};

const fetchDiscordRawProfile = async (accessToken) => {
  if (!accessToken) return null;
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json();
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

router.get("/google/url", async (_req, res) => {
  try {
    const url = await getGoogleAuthURL();
    return res.json({ url });
  } catch (error) {
    console.error("Google auth URL error", error);
    return res.json({ url: null });
  }
});

router.get("/discord/url", async (_req, res) => {
  try {
    const url = await getDiscordAuthURL();
    return res.json({ url });
  } catch (error) {
    console.error("Discord auth URL error", error);
    return res.json({ url: null });
  }
});

router.get("/apple/url", async (_req, res) => {
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
    const tokens = await exchangeGoogleCode(code);
    const profile = await getGoogleUser(tokens);
    const decoded = decodeJwtPayload(tokens?.id_token);
    const providerId = decoded?.sub || profile?.email;
    if (!providerId) {
      throw new Error("Missing Google provider ID");
    }
    const user = await findOrCreateOAuthUser("google", {
      providerId,
      email: profile?.email || decoded?.email || null,
    });
    return redirectWithToken(res, user);
  } catch (error) {
    console.error("Google OAuth callback error", error);
    return res.redirect(ERROR_REDIRECT);
  }
});

router.get("/discord/callback", async (req, res) => {
  const code = req.query?.code;
  if (!code) {
    return res.redirect(ERROR_REDIRECT);
  }
  try {
    const tokens = await exchangeDiscordCode(code);
    const profile = await getDiscordUser(tokens);
    const rawProfile = await fetchDiscordRawProfile(tokens?.access_token);
    const providerId = rawProfile?.id || profile?.email;
    if (!providerId) {
      throw new Error("Missing Discord provider ID");
    }
    const user = await findOrCreateOAuthUser("discord", {
      providerId,
      email: profile?.email || null,
    });
    return redirectWithToken(res, user);
  } catch (error) {
    console.error("Discord OAuth callback error", error);
    return res.redirect(ERROR_REDIRECT);
  }
});

router.post("/apple/callback", async (req, res) => {
  const code = req.body?.code || req.query?.code;
  if (!code) {
    return res.redirect(ERROR_REDIRECT);
  }
  try {
    const tokens = await exchangeAppleCode(code);
    const decoded = decodeJwtPayload(tokens?.id_token);
    const profile = await getAppleUser(tokens?.id_token);
    const providerId = decoded?.sub || profile?.email;
    if (!providerId) {
      throw new Error("Missing Apple provider ID");
    }
    const user = await findOrCreateOAuthUser("apple", {
      providerId,
      email: profile?.email || decoded?.email || null,
    });
    return redirectWithToken(res, user);
  } catch (error) {
    console.error("Apple OAuth callback error", error);
    return res.redirect(ERROR_REDIRECT);
  }
});

export default router;
