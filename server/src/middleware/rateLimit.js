const store = new Map();

export function createRateLimiter({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}`;
    const entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      store.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }

    entry.count += 1;
    store.set(key, entry);
    return next();
  };
}
