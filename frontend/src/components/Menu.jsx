import React, { useEffect, useRef } from "react";

export default function Menu({ open, onClose, stats }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    if (open) {
      document.addEventListener("mousedown", handler);
    }
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-40 transition ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={ref}
        className={`absolute right-0 top-0 h-full w-full max-w-sm glass p-6 transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Menu</h3>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>
        <nav className="space-y-3">
          {["Home", "Wall", "About", "Partnerships", "Contact"].map((item) => (
            <a
              key={item}
              href="#"
              className="block text-white/80 hover:text-white"
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="mt-6 space-y-2">
          <div className="text-sm text-white/60">Stats</div>
          <div className="flex flex-wrap gap-2">
            <StatPill label="Total Pixels" value={stats?.totalPixels ?? 1080000} />
            <StatPill label="Followers" value={stats?.followersCount ?? 0} />
            <StatPill label="Filled" value={stats?.spotsFilled ?? 0} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="glass px-3 py-2 text-sm">
      <div className="text-white/60">{label}</div>
      <div className="font-semibold">{value?.toLocaleString()}</div>
    </div>
  );
}
