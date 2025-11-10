const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

const BASE_URL = import.meta?.env?.VITE_API_BASE_URL || "http://localhost:4000";

const handleResponse = async (response) => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const fetchStats = () =>
  fetch(`${BASE_URL}/api/stats`, {
    method: "GET",
    headers: DEFAULT_HEADERS,
  }).then(handleResponse);

export const sendPresenceHeartbeat = ({ sessionId, isSelecting = false, selectionPixels = 0 }) =>
  fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ sessionId, isSelecting, selectionPixels }),
  }).then(handleResponse);

