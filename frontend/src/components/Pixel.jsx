import React from "react";

export default function Pixel({
  avatarUrl,
  size = 16,
  onClick,
  username,
  style,
  isNew = false
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute pixel-hover ${isNew ? "pixel-new-glow" : ""}`}
      style={{ width: size, height: size, ...(style || {}) }}
      aria-label={`Open profile of ${username || "follower"}`}
    >
      <img
        src={avatarUrl}
        alt={username || "follower"}
        className="w-full h-full object-cover rounded-sm"
        draggable={false}
      />
    </button>
  );
}
