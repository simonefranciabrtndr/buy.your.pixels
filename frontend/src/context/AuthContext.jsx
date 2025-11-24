import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ===========================================================
  // Restore session on startup
  // ===========================================================
  async function fetchMe() {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include"
      });
      const data = await res.json();
      if (data?.id) {
        setCurrentUser(data);
      } else if (data?.user) {
        setCurrentUser(data.user);
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

  function socialLoginURL(provider) {
    return `/api/auth/${provider}/url`;
  }

  async function handleSocialRedirect() {
    if (typeof window === "undefined") return;
    setAuthLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (!token) {
        await fetchMe();
      } else {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const data = await res.json();
        if (data?.user) {
          setCurrentUser(data.user);
        } else if (data?.id) {
          setCurrentUser(data);
        } else {
          setCurrentUser(null);
        }
      }
    } catch (error) {
      console.error("AuthContext handleSocialRedirect error:", error);
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
      const cleanUrl = window.location.origin + "/";
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  // ===========================================================
  // INITIAL LOAD
  // ===========================================================
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/social-login") {
      handleSocialRedirect();
    } else {
      fetchMe();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authLoading,
        login,
        register,
        logout,
        startSocialLogin,
        socialLoginURL,
        handleSocialRedirect
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
