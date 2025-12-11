// Minimal in-memory Pixel model placeholder to satisfy pixel purchase confirmation.
const pixelStore = new Map();

const buildKey = ({ x, y }) => `${x}:${y}`;

const findOneAndUpdate = async (query, update, options = {}) => {
  const key = buildKey(query || {});
  const existing = pixelStore.get(key) || {};
  const next = { ...existing, ...update };
  pixelStore.set(key, next);
  return next;
};

const find = async () => Array.from(pixelStore.values());

export default { findOneAndUpdate, find };
