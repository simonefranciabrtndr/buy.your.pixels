import { useEffect, useRef, useState } from "react";
import { sendPresenceHeartbeat } from "../api/stats";

const HEARTBEAT_INTERVAL = 10000;
const STORAGE_KEY = "buyYourPixels.presenceId";

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getStoredId = () => {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next = generateId();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return generateId();
  }
};

export function usePresenceSync({ selectionPixels = 0, isSelecting = false } = {}) {
  const [sessionId, setSessionId] = useState(null);
  const payloadRef = useRef({
    selectionPixels: Math.max(0, Math.round(selectionPixels || 0)),
    isSelecting: Boolean(isSelecting),
  });

  useEffect(() => {
    payloadRef.current = {
      selectionPixels: Math.max(0, Math.round(selectionPixels || 0)),
      isSelecting: Boolean(isSelecting),
    };
  }, [selectionPixels, isSelecting]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    setSessionId(getStoredId());
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    const pushHeartbeat = async () => {
      try {
        await sendPresenceHeartbeat({
          sessionId,
          selectionPixels: payloadRef.current.selectionPixels,
          isSelecting: payloadRef.current.isSelecting,
        });
      } catch (error) {
        if (!cancelled) {
          console.warn("Unable to sync presence", error);
        }
      }
    };

    pushHeartbeat();
    const interval = setInterval(pushHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);
}

