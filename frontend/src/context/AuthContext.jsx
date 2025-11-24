import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ===========================================================
  // Restore session on startup
  // ===========================================================
  async function fetchMe() {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include"
      });
      const data = await res.json();
      if (data && data.id) {
        setCurrentUser(data);
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error("AuthContext fetchMe error:", err);
      setCurrentUser(null);
    }
    setAuthLoading(false);
  }

  // ===========================================================
  // Email/Password Register
  // ===========================================================
  async function register(email, password) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Registration failed");
    const data = await res.json();
    await login(email, password);
    return data;
  }

  // ===========================================================
  // Email/Password Login
  // ===========================================================
  async function login(email, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    setCurrentUser(data);
    return data;
  }

  // ===========================================================
  // Logout
  // ===========================================================
  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch {}
    setCurrentUser(null);
  }

  // ===========================================================
  // Social login redirect helper
  // ===========================================================
  async function startSocialLogin(provider) {
    const res = await fetch(`/api/auth/${provider}/url`);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  // ===========================================================
  // INITIAL LOAD
  // ===========================================================
  useEffect(() => {
    fetchMe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authLoading,
        login,
        register,
        logout,
        startSocialLogin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
