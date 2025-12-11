import React from "react";

export default function RotateHint() {
  return (
    <div className="fixed bottom-4 inset-x-0 flex justify-center px-4 md:hidden pointer-events-none">
      <div className="glass px-3 py-2 text-xs text-white/80 flex items-center gap-2 pointer-events-auto">
        <span className="inline-block">🔁</span>
        <span>Rotate your device for a full Wall view.</span>
      </div>
    </div>
  );
}
