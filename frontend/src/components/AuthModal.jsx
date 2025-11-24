import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./AuthModal.css";

export default function AuthModal({ onClose }) {
  const { login, register, startSocialLogin, authLoading } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        await register(email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed.");
    }
  }

  return (
    <div className="authmodal-overlay">
      <div className="authmodal glassy">
        <button className="authmodal-close" onClick={onClose}>×</button>

        <div className="authmodal-header">
          <h2>{mode === "login" ? "Log In" : "Sign Up"}</h2>
        </div>

        <div className="authmodal-toggle">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </button>
        </div>

        <form className="authmodal-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && (
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              required
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}

          {error && <p className="authmodal-error">{error}</p>}

          <button type="submit" className="authmodal-submit">
            {mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>

        <div className="authmodal-divider">or continue with</div>

        <div className="authmodal-socials">
          <button onClick={() => startSocialLogin("google")} className="google">
            Continue with Google
          </button>
          <button onClick={() => startSocialLogin("apple")} className="apple">
            Continue with Apple
          </button>
          <button onClick={() => startSocialLogin("discord")} className="discord">
            Continue with Discord
          </button>
        </div>
      </div>
    </div>
  );
}
