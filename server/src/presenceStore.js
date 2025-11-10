const SESSION_TTL_MS = 45 * 1000;

const sessions = new Map();

const now = () => Date.now();

const cleanup = () => {
  const cutoff = now() - SESSION_TTL_MS;
  sessions.forEach((session, sessionId) => {
    if (session.lastSeen < cutoff) {
      sessions.delete(sessionId);
    }
  });
};

setInterval(cleanup, SESSION_TTL_MS).unref?.();

export const touchPresence = ({ sessionId, isSelecting = false, selectionPixels = 0 } = {}) => {
  if (!sessionId) {
    return;
  }
  const normalizedPixels = Math.max(0, Math.round(Number(selectionPixels) || 0));
  sessions.set(sessionId, {
    lastSeen: now(),
    selectionPixels: normalizedPixels,
    isSelecting: Boolean(isSelecting) || normalizedPixels > 0,
  });
};

export const getPresenceStats = () => {
  cleanup();
  let activeSelections = 0;
  let selectedPixels = 0;

  sessions.forEach((session) => {
    if (session.isSelecting || session.selectionPixels > 0) {
      activeSelections += 1;
      selectedPixels += session.selectionPixels || 0;
    }
  });

  return {
    onlineUsers: sessions.size,
    activeSelections,
    selectedPixels,
  };
};

