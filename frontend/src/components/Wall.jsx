import React, { useMemo, useState, useRef } from "react";
import Pixel from "./Pixel.jsx";
import ProfilePopup from "./ProfilePopup.jsx";

const WALL_WIDTH = 1200;
const WALL_HEIGHT = 900;
const BLOCK_SIZE = 4;
const CSS_BLOCK_SIZE = 16; // visual size per 4x4 microcell block

export default function Wall({ followers, zoom, panX, panY, handlers }) {
  const [activeFollower, setActiveFollower] = useState(null);

  // Track which followers have already been seen so that the
  // "new follower" glow only appears once per follower.
  const seenRef = useRef(new Set());

  const wallStyle = useMemo(
    () => ({
      width: WALL_WIDTH * (CSS_BLOCK_SIZE / BLOCK_SIZE),
      height: WALL_HEIGHT * (CSS_BLOCK_SIZE / BLOCK_SIZE),
      transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
      transformOrigin: "center",
    }),
    [panX, panY, zoom]
  );

  const followersWithClientFlags = useMemo(() => {
    const seen = seenRef.current;
    return followers.map((f) => {
      const key = `${f.wallId}-${f.slotIndex}`;
      const backendIsNew = f.isNew === true;
      const hasSeen = seen.has(key);

      let isNewClient = false;
      if (backendIsNew && !hasSeen) {
        isNewClient = true;
        seen.add(key);
      }

      return {
        ...f,
        _isNewClient: isNewClient,
      };
    });
  }, [followers]);

  return (
    <>
      <div
        className="relative overflow-auto glass p-3 touch-pan-y"
        style={{ minHeight: 320 }}
        {...handlers}
      >
        <div
          className="relative bg-[#0f152d] border border-white/10 wall-fade-in"
          style={wallStyle}
        >
          {followersWithClientFlags.map((f) => {
            const left = (f.position?.x ?? 0) * (CSS_BLOCK_SIZE / BLOCK_SIZE);
            const top = (f.position?.y ?? 0) * (CSS_BLOCK_SIZE / BLOCK_SIZE);

            return (
              <Pixel
                key={`${f.wallId}-${f.slotIndex}`}
                avatarUrl={f.avatarUrl}
                username={f.username}
                size={CSS_BLOCK_SIZE}
                onClick={() => setActiveFollower(f)}
                isNew={f._isNewClient === true}
                style={{ left, top }}
              />
            );
          })}
        </div>
      </div>
      <ProfilePopup
        follower={activeFollower}
        onClose={() => setActiveFollower(null)}
      />
    </>
  );
}
