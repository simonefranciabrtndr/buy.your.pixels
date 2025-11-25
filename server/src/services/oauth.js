// src/services/oauth.js
import fetch from "node-fetch";

/**
 * Generic function to exchange an OAuth "code" for user profile data.
 * Each provider has its own token endpoint + profile endpoint.
 * This module exposes 3 provider helpers:
 *  - googleAuth
 *  - appleAuth   (scaffold, no full implementation)
 *  - discordAuth
 */

// --------------------------
// GOOGLE OAUTH
// --------------------------

export async function googleAuth(code, redirectUri, clientId, clientSecret) {
  // 1. Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("Google token exchange failed:", await tokenRes.text());
    throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  }

  const tokenData = await tokenRes.json();

  // 2. Get user info
  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  );

  if (!profileRes.ok) {
    console.error("Google profile fetch failed:", await profileRes.text());
    throw new Error("GOOGLE_PROFILE_FAILED");
  }

  const profile = await profileRes.json();

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    provider: "google",
  };
}

// --------------------------
// DISCORD OAUTH
// --------------------------

export async function discordAuth(code, redirectUri, clientId, clientSecret) {
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error("Discord token exchange failed:", await tokenRes.text());
    throw new Error("DISCORD_TOKEN_EXCHANGE_FAILED");
  }

  const tokenData = await tokenRes.json();

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    console.error("Discord profile fetch failed:", await userRes.text());
    throw new Error("DISCORD_PROFILE_FAILED");
  }

  const profile = await userRes.json();

  return {
    id: profile.id,
    email: profile.email || null,
    name: profile.username,
    picture:
      profile.avatar &&
      `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
    provider: "discord",
  };
}

// --------------------------
// APPLE OAUTH (SCAFFOLD ONLY)
// --------------------------

export async function appleAuth(code) {
  // Apple requires private key signing — skip full implementation for now
  throw new Error("APPLE_OAUTH_NOT_IMPLEMENTED");
}
