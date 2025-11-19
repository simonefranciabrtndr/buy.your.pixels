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

export default function ProfileManagerModal({ isOpen, onClose, initialProfile, onSaved }) {
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    avatarFile: null,
    avatarData: null,
    subscribeNewsletter: true,
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => form.email && form.username && form.password, [form]);

  useEffect(() => {
    if (isOpen && initialProfile) {
      setForm((prev) => ({
        ...prev,
        email: initialProfile.email || "",
        username: initialProfile.username || "",
        avatarData: initialProfile.avatarData || null,
      }));
      setAvatarPreview(initialProfile.avatarData || null);
    }
  }, [isOpen, initialProfile]);

  if (!isOpen) return null;

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    setForm((prev) => ({ ...prev, avatarFile: file || null }));
    if (file) {
      const url = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, avatarData: url }));
      setAvatarPreview(url);
    } else {
      setForm((prev) => ({ ...prev, avatarData: null, avatarFile: null }));
      setAvatarPreview(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    try {
      await registerProfile({
        email: form.email,
        username: form.username,
        subscribeNewsletter: form.subscribeNewsletter,
      });
      setStatus("success");
      setMessage("Profile saved! Check your inbox for a thank-you email.");
      const savedProfile = {
        email: form.email,
        username: form.username,
        avatarData: form.avatarData || avatarPreview || null,
      };
      onSaved?.(savedProfile);
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

          {message && (
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
