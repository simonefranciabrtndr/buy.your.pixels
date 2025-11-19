import React, { useMemo, useState } from "react";
import "./ProfileManagerModal.css";

export default function ProfileManagerModal({ isOpen, onClose }) {
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    avatarFile: null,
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => form.email && form.username && form.password, [form]);

  if (!isOpen) return null;

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    setForm((prev) => ({ ...prev, avatarFile: file || null }));
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
    } else {
      setAvatarPreview(null);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    setTimeout(() => {
      setStatus("success");
      setMessage(
        "Profile saved! You can now update your pixel artwork, linked website and NSFW preference at any time."
      );
    }, 900);
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
            <h3 id="profileModalTitle">Manage your pixels</h3>
            <p className="profile-modal-subtitle">
              Register a profile so you can edit purchased pixels even after checkout.
            </p>
          </header>

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

          {message && (
            <div className={`profile-status-message${status === "success" ? " success" : ""}`} role="status">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
