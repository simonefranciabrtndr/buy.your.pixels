import React, { useEffect, useMemo, useState } from "react";
import { developerLogin, fetchDeveloperPurchases, updateDeveloperPurchase } from "../api/developer";
import "./DeveloperConsole.css";

const TOKEN_STORAGE_KEY = "buyYourPixels.developerToken";

const normalizePurchase = (purchase) => ({
  id: purchase.id,
  area: purchase.area,
  price: purchase.price,
  link: purchase.link,
  nsfw: Boolean(purchase.nsfw),
  createdAt: purchase.createdAt,
});

export default function DeveloperConsole({ isOpen, onClose }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [updateStatus, setUpdateStatus] = useState({});

  const isLoggedIn = Boolean(token);

  useEffect(() => {
    if (!isOpen || !token) return;
    setLoadingPurchases(true);
    fetchDeveloperPurchases(token)
      .then((data) => {
        const normalized = (data?.purchases || []).map(normalizePurchase);
        setPurchases(normalized);
      })
      .catch((error) => {
        console.error("Developer purchases error", error);
        if (error.message?.toLowerCase().includes("auth")) {
          setToken(null);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      })
      .finally(() => setLoadingPurchases(false));
  }, [token, isOpen]);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!password) return;
    try {
      setLoginError("");
      const data = await developerLogin(password);
      setToken(data.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setPassword("");
    } catch (error) {
      setLoginError(error.message || "Unable to login");
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setPurchases([]);
  };

  const handleToggleNsfw = async (purchase) => {
    if (!token) return;
    setUpdateStatus((prev) => ({ ...prev, [purchase.id]: "saving" }));
    try {
      const updated = await updateDeveloperPurchase(token, purchase.id, { nsfw: !purchase.nsfw });
      setPurchases((prev) =>
        prev.map((item) => (item.id === updated.id ? normalizePurchase(updated) : item))
      );
    } catch (error) {
      console.error("Failed to update purchase", error);
      setUpdateStatus((prev) => ({ ...prev, [purchase.id]: "error" }));
      return;
    }
    setUpdateStatus((prev) => ({ ...prev, [purchase.id]: "idle" }));
  };

  const sortedPurchases = useMemo(
    () => [...purchases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [purchases]
  );

  if (!isOpen) return null;

  return (
    <div className="developer-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="developerConsoleTitle">
      <div className="developer-modal">
        <button type="button" className="developer-close-btn" onClick={onClose} aria-label="Close developer console">
          ×
        </button>
        {!isLoggedIn ? (
          <form className="developer-login-card" onSubmit={handleLogin}>
            <p className="developer-kicker">Developer console</p>
            <h3 id="developerConsoleTitle">Restricted access</h3>
            <p className="developer-subtitle">Enter the developer passphrase to review purchases.</p>
            <input
              type="password"
              placeholder="Developer password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {loginError && <div className="developer-error">{loginError}</div>}
            <button type="submit" className="developer-login-btn">
              Enter console
            </button>
          </form>
        ) : (
          <div className="developer-console-body">
            <header className="developer-console-header">
              <div>
                <p className="developer-kicker">Developer console</p>
                <h3 id="developerConsoleTitle">Moderate purchased pixels</h3>
                <p className="developer-subtitle">
                  Toggle NSFW to blur sensitive artwork or force re-review of a block.
                </p>
              </div>
              <button type="button" className="developer-logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </header>

            {loadingPurchases ? (
              <div className="developer-loading">Loading purchases…</div>
            ) : (
              <div className="developer-purchase-list">
                {sortedPurchases.map((purchase) => (
                  <article key={purchase.id} className="developer-purchase-card">
                    <div className="developer-purchase-info">
                      <div>
                        <span className="developer-card-label">ID</span>
                        <span>{purchase.id}</span>
                      </div>
                      <div>
                        <span className="developer-card-label">Pixels</span>
                        <span>{purchase.area}</span>
                      </div>
                      <div>
                        <span className="developer-card-label">Link</span>
                        <a href={purchase.link || "#"} target="_blank" rel="noreferrer">
                          {purchase.link || "No link"}
                        </a>
                      </div>
                    </div>
                    <div className="developer-purchase-actions">
                      <span className={`developer-pill${purchase.nsfw ? " danger" : ""}`}>
                        {purchase.nsfw ? "NSFW / Blurred" : "Public"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleNsfw(purchase)}
                        disabled={updateStatus[purchase.id] === "saving"}
                      >
                        {purchase.nsfw ? "Unblur" : "Blur / mark NSFW"}
                      </button>
                    </div>
                    {updateStatus[purchase.id] === "error" && (
                      <div className="developer-error">Unable to update this purchase. Try again.</div>
                    )}
                  </article>
                ))}
                {!sortedPurchases.length && (
                  <div className="developer-empty">No purchases recorded yet.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
