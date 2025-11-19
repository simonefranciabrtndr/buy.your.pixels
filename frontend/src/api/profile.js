import inferApiBaseUrl from "./baseUrl";

const BASE_URL = inferApiBaseUrl();
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
};

export const registerProfile = async ({ email, username, subscribeNewsletter }) => {
  const response = await fetch(`${BASE_URL}/api/profile/register`, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({
      email,
      username,
      subscribeNewsletter: Boolean(subscribeNewsletter),
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to register profile");
  }
  return response.json();
};
