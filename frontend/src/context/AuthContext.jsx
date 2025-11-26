import React, { createContext, useEffect, useState, useCallback } from "react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL;

  const fetchUser = useCallback(async () => {
    try {
      console.log("🔍 Fetching /api/auth/me...");
      const res = await fetch(`${API_URL}/api/auth/me`, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();
      console.log("➡️ /me result:", data);

      if (data?.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("❌ Error fetching user:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    console.log("🌐 AuthContext mounted — loading user...");
    fetchUser();

    const handler = () => {
      console.log("🔄 auth-updated event received — refreshing user...");
      fetchUser();
    };
    window.addEventListener("auth-updated", handler);

    return () => window.removeEventListener("auth-updated", handler);
  }, [fetchUser]);

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      localStorage.removeItem("authToken");
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
