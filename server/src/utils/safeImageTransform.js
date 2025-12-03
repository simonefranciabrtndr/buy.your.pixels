const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function validateTransform(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};

  if (typeof input.scale !== "undefined") {
    const scale = Number(input.scale);
    if (!Number.isFinite(scale)) throw new Error("Invalid transform");
    out.scale = clamp(scale, 0.1, 3);
  }

  if (typeof input.rotate !== "undefined") {
    const rotate = Number(input.rotate);
    if (!Number.isFinite(rotate)) throw new Error("Invalid transform");
    out.rotate = clamp(rotate, -180, 180);
  }

  if (typeof input.offsetX !== "undefined") {
    const offsetX = Number(input.offsetX);
    if (!Number.isFinite(offsetX)) throw new Error("Invalid transform");
    out.offsetX = offsetX;
  }

  if (typeof input.offsetY !== "undefined") {
    const offsetY = Number(input.offsetY);
    if (!Number.isFinite(offsetY)) throw new Error("Invalid transform");
    out.offsetY = offsetY;
  }

  return out;
}
