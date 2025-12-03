import jwt from "jsonwebtoken";

// FIX: enforce presence of JWT secret at module load
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required for auth");
}

export const authMiddleware = (req, _res, next) => {
  req.user = null;
  const token = req.cookies?.auth_token;
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

export function issueAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

  console.log("🔥 Setting auth cookie on backend domain:", res?.req?.hostname);

  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
}

export function clearAuthCookie(res) {
  res.cookie("auth_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    expires: new Date(0),
  });
}
