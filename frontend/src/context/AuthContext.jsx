import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const API_URL = import.meta.env.VITE_API_URL;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch user from backend
  const loadUser = useCallback(async () => {
    const token = window.localStorage.getItem("authToken");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data?.user) {
        window.localStorage.removeItem("authToken");
        setUser(null);
      } else {
        setUser(data.user);
      }
    } catch (err) {
      console.error("AuthContext loadUser error:", err);
      window.localStorage.removeItem("authToken");
      setUser(null);
    }
    setLoading(false);
  }, [API_URL]);

  // On mount, load user
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Listen for auth-updated from social-login
  useEffect(() => {
    const handler = () => loadUser();
    window.addEventListener("auth-updated", handler);
    return () => window.removeEventListener("auth-updated", handler);
  }, [loadUser]);

  // login(): store token, notify, reload
  const login = useCallback((token) => {
    window.localStorage.setItem("authToken", token);
    window.dispatchEvent(new Event("auth-updated"));
  }, []);

  // logout(): clear token, backend logout, refresh state
  const logout = useCallback(async () => {
    const token = window.localStorage.getItem("authToken");
    window.localStorage.removeItem("authToken");
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
    setUser(null);
    setLoading(false);
  }, [API_URL]);

  const value = {
    user,
    loading,
    login,
    logout,
    refresh: loadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
