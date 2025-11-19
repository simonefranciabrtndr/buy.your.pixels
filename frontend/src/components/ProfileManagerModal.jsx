import React, { useEffect, useMemo, useState } from "react";
import { registerProfile } from "../api/profile";
import "./ProfileManagerModal.css";

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ProfileManagerModal({
  isOpen,
  onClose,
  profile,
  purchases = [],
  token,
  onProfileSync,
}) {
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    avatarData: null,
    subscribeNewsletter: true,
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const hasProfile = Boolean(token && profile);
  const canSubmit = useMemo(() => form.email && form.username && form.password, [form]);
  const ownedPixels = useMemo(
    () => purchases.reduce((sum, item) => sum + Math.max(0, Math.round(item.area || 0)), 0),
    [purchases]
  );
  const donatedEuros = useMemo(
    () => purchases.reduce((sum, item) => sum + Number(item.price || 0), 0) * 0.005,
    [purchases]
  );

  useEffect(() => {
    if (isOpen && profile) {
      setForm((prev) => ({
        ...prev,
        email: profile.email || "",
        username: profile.username || "",
        avatarData: profile.avatarData || null,
      }));
      setAvatarPreview(profile.avatarData || null);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((prev) => ({ ...prev, avatarData: null }));
      setAvatarPreview(null);
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setForm((prev) => ({ ...prev, avatarData: dataUrl }));
    setAvatarPreview(dataUrl);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    try {
      const data = await registerProfile({
        email: form.email,
        username: form.username,
        password: form.password,
        avatarData: form.avatarData,
        subscribeNewsletter: form.subscribeNewsletter,
      });
      onProfileSync?.(data);
      setStatus("success");
      setMessage("Profile saved! Check your inbox for a thank-you email.");
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
        onClose?.();
      }, 1200);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Unable to save your profile right now.");
    }
  };

  return (
    <div className="profile-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
      <div className="profile-modal">
        <button type="button" className="profile-close-btn" onClick={onClose} aria-label="Close profile manager">
          ×
        </button>
        <div className="profile-modal-body">
          <header>
            <p className="profile-modal-kicker">Creator account</p>
            <h3 id="profileModalTitle">{hasProfile ? "Your profile" : "Manage your pixels"}</h3>
            <p className="profile-modal-subtitle">
              {hasProfile
                ? "Track the impact of your purchases and how much goes to charity."
                : "Register a profile so we can keep your pixels and donations in sync."}
            </p>
          </header>

          {!hasProfile && (
            <>
              <form className="profile-form-card" onSubmit={handleSubmit}>
                <label className="profile-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="you@email.com"
                    required
                  />
                </label>
                <label className="profile-field">
                  <span>Username</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={handleChange("username")}
                    placeholder="Creative alias"
                    required
                  />
                </label>
                <label className="profile-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                </label>
                <label className="profile-field profile-avatar-upload">
                  <span>Profile image</span>
                  <div className="profile-avatar-row">
                    <div className="profile-avatar-thumb">
                      {avatarPreview ? <img src={avatarPreview} alt="Preview" /> : <span>Preview</span>}
                    </div>
                    <input type="file" accept="image/*" onChange={handleAvatarChange} />
                  </div>
                  <small>Square images work best. Max 2MB.</small>
                </label>
                <label className="profile-field profile-newsletter-toggle">
                  <span>Newsletter</span>
                  <div className="profile-toggle-row">
                    <input
                      type="checkbox"
                      checked={form.subscribeNewsletter}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, subscribeNewsletter: event.target.checked }))
                      }
                    />
                    <p>Opt-in for monthly progress updates and artist spotlights.</p>
                  </div>
                </label>
                <button type="submit" className="profile-submit-btn" disabled={!canSubmit || status === "submitting"}>
                  {status === "submitting" ? "Saving…" : "Create profile"}
                </button>
              </form>

              <section className="profile-info-card">
                <h4>What can you edit later?</h4>
                <ul>
                  <li>Upload a new image for any pixel block you own.</li>
                  <li>Change the external website linked to those pixels.</li>
                  <li>Toggle the NSFW flag if the content changes.</li>
                </ul>
                <p className="profile-info-note">
                  These updates will be available immediately after authenticating with the email + password above.
                </p>
              </section>
            </>
          )}

          {hasProfile && (
            <div className="profile-dashboard">
              <div className="profile-summary-card">
                <div className="profile-summary-avatar">
                  {profile.avatarData ? (
                    <img src={profile.avatarData} alt={profile.username} />
                  ) : (
                    profile.username?.[0] ?? "?"
                  )}
                </div>
                <div>
                  <strong>{profile.username}</strong>
                  <p>{profile.email}</p>
                </div>
              </div>
              <div className="profile-metrics">
                <div className="profile-metric-card">
                  <span>Pixels owned</span>
                  <strong>{ownedPixels.toLocaleString()} px</strong>
                </div>
                <div className="profile-metric-card">
                  <span>Donated thanks to you (0.5%)</span>
                  <strong>€{donatedEuros.toFixed(2)}</strong>
                </div>
              </div>
              {!purchases.length && (
                <div className="profile-empty-state">No pixel blocks claimed yet. Purchase something to get started!</div>
              )}
            </div>
          )}
          {message && !hasProfile && (
            <div
              className={`profile-status-message${
                status === "success" ? " success" : status === "error" ? " error" : ""
              }`}
              role="status"
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
