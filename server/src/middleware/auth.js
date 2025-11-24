import jwt from "jsonwebtoken";

const COOKIE_NAME = "auth_token";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const authMiddleware = (req, _res, next) => {
  req.user = null;
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
  } catch {
    req.user = null;
  }
  next();
};

export const issueAuthCookie = (res, payload, options = {}) => {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...options,
  });
  return token;
};

export const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};
