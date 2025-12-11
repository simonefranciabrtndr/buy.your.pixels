import React from "react";
import MainLayout from "../layout/MainLayout.jsx";
import Hero from "../components/Hero.jsx";
import Menu from "../components/Menu.jsx";
import Wall from "../components/Wall.jsx";
import RotateHint from "../components/RotateHint.jsx";
import { useWallData } from "../hooks/useWallData.js";
import { useZoomPan } from "../hooks/useZoomPan.js";

export default function Home({ menuOpen, setMenuOpen }) {
  const { followers, stats, loading, error } = useWallData(1);
  const { zoom, panX, panY, handlers } = useZoomPan({
    initialZoom: 1,
    minZoom: 0.5,
    maxZoom: 3,
  });

  return (
    <MainLayout>
      <Hero onMenuToggle={() => setMenuOpen(true)} />
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} stats={stats} />

      <section className="mt-4 glass p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">Wall 1</h3>
            <p className="text-sm text-white/60">
              1200 × 900 micro-cells • Each follower is a 4×4 block
            </p>
          </div>
          <div className="text-sm text-white/60">
            Zoom: {zoom.toFixed(2)}x
          </div>
        </div>

        {loading && <div className="text-white/70">Loading wall…</div>}
        {error && <div className="text-red-400">Error: {error}</div>}
        {!loading && !error && (
          <Wall
            followers={followers}
            zoom={zoom}
            panX={panX}
            panY={panY}
            handlers={handlers}
          />
        )}
      </section>

      <RotateHint />
    </MainLayout>
  );
}
