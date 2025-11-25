import querystring from "querystring";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const SOCIAL_SUCCESS_REDIRECT = process.env.AUTH_SUCCESS_REDIRECT_URL || "https://yourpixels.online/social-login";
console.log("🔥 Loaded SOCIAL_SUCCESS_REDIRECT (oauth.js):", SOCIAL_SUCCESS_REDIRECT);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY;
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI;

/* --------------------------------------- */
/* GOOGLE OAUTH */
/* --------------------------------------- */
export function getGoogleAuthURL() {
  const base = "https://accounts.google.com/o/oauth2/v2/auth";

  const params = {
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent"
  };

  return `${base}?${querystring.encode(params)}`;
}

export async function handleGoogleCallback(code) {
  const tokenURL = "https://oauth2.googleapis.com/token";

  const tokenRes = await fetch(tokenURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: querystring.encode({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code
    })
  }).then(res => res.json());

  const userRes = await fetch(
    `https://openidconnect.googleapis.com/v1/userinfo`,
    { headers: { Authorization: `Bearer ${tokenRes.access_token}` } }
  ).then(res => res.json());

  return {
    email: userRes.email,
    name: userRes.name,
    picture: userRes.picture
  };
}

/* --------------------------------------- */
/* APPLE OAUTH */
/* --------------------------------------- */
function generateAppleClientSecret() {
  return jwt.sign(
    {
      iss: APPLE_TEAM_ID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 180,
      aud: "https://appleid.apple.com",
      sub: APPLE_CLIENT_ID
    },
    APPLE_PRIVATE_KEY,
    {
      algorithm: "ES256",
      keyid: APPLE_KEY_ID
    }
  );
}

export function getAppleAuthURL() {
  const base = "https://appleid.apple.com/auth/authorize";

  const params = {
    response_type: "code",
    response_mode: "form_post",
    client_id: APPLE_CLIENT_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    scope: "name email"
  };

  return `${base}?${querystring.encode(params)}`;
}

export async function handleAppleCallback(code) {
  const tokenURL = "https://appleid.apple.com/auth/token";

  const clientSecret = generateAppleClientSecret();

  const tokenRes = await fetch(tokenURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: querystring.encode({
      grant_type: "authorization_code",
      code,
      redirect_uri: APPLE_REDIRECT_URI,
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret
    })
  }).then(res => res.json());

  const idToken = jwt.decode(tokenRes.id_token);

  return {
    email: idToken.email,
    name: idToken.name || "",
    picture: null
  };
}
