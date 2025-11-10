import React from "react";

const DEFAULT_TRANSFORM = { x: 0, y: 0, width: 1, height: 1 };

export default function CanvasOverlay({ area, imageSrc, transform }) {
  if (!area || !area.rect || !imageSrc) return null;

  const bounds = area.rect;
  const tiles = Array.isArray(area.tiles) && area.tiles.length ? area.tiles : [bounds];
  const appliedTransform = transform || DEFAULT_TRANSFORM;

  const boundsWidth = bounds.w;
  const boundsHeight = bounds.h;
  const imageWidth = boundsWidth * appliedTransform.width;
  const imageHeight = boundsHeight * appliedTransform.height;
  const imageOffsetX = appliedTransform.x * boundsWidth;
  const imageOffsetY = appliedTransform.y * boundsHeight;

  const wrapperStyle = {
    position: "absolute",
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.w}px`,
    height: `${bounds.h}px`,
    overflow: "visible",
    border: "none",
    borderRadius: "0",
    zIndex: 150,
    pointerEvents: "none",
    animation: "fadeIn 0.4s ease-in-out",
    background: "transparent",
  };

  return (
    <div style={wrapperStyle}>
      {tiles.map((tile, index) => {
        if (!tile || tile.w <= 0 || tile.h <= 0) return null;
        const relativeLeft = tile.x - bounds.x;
        const relativeTop = tile.y - bounds.y;
        const tileStyle = {
          position: "absolute",
          left: `${relativeLeft}px`,
          top: `${relativeTop}px`,
          width: `${tile.w}px`,
          height: `${tile.h}px`,
          backgroundImage: `url(${imageSrc})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${imageWidth}px ${imageHeight}px`,
          backgroundPosition: `${imageOffsetX - relativeLeft}px ${imageOffsetY - relativeTop}px`,
          borderRadius: "6px",
          overflow: "hidden",
          boxShadow: "0 0 12px rgba(255,165,0,0.35)",
        };
        return <div key={`${tile.x}-${tile.y}-${index}`} style={tileStyle} />;
      })}
    </div>
  );
}
