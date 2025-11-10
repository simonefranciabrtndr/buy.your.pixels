import { useEffect, useState } from "react";
import { fetchStats } from "../api/stats";

const DEFAULT_STATS = {
  board: { width: 0, height: 0, totalPixels: 0 },
  purchasedPixels: 0,
  availablePixels: 0,
  onlineUsers: 0,
  activeSelections: 0,
  selectedPixels: 0,
};

export function usePresenceStats({ pollInterval = 15000 } = {}) {
  const [stats, setStats] = useState(DEFAULT_STATS);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const data = await fetchStats();
        if (!cancelled && data) {
          setStats({
            ...DEFAULT_STATS,
            ...data,
            board: {
              ...DEFAULT_STATS.board,
              ...(data.board || {}),
            },
          });
        }
      } catch (error) {
        console.warn("Unable to load presence stats", error);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, pollInterval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollInterval]);

  return stats;
}
