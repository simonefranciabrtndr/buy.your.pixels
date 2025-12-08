import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import inferApiBaseUrl from "../api/baseUrl";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const API_URL = inferApiBaseUrl();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: "GET",
        credentials: "include",
      });
      const data = await res.json();
      setUser(data?.user || null);
    } catch (error) {
      console.error("AuthContext refreshUser error:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handler = () => refreshUser();
    window.addEventListener("auth-updated", handler);
    return () => window.removeEventListener("auth-updated", handler);
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setLoading(false);
    }
  }, [API_URL]);

  const login = useCallback(
    async (email, password) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Unable to login");
      }

      const data = await res.json();
      await refreshUser();
      window.dispatchEvent(new CustomEvent("auth-updated"));
      return data;
    },
    [API_URL, refreshUser]
  );

  const register = useCallback(
    async (email, password) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Unable to register");
      }

      const data = await res.json();
      await login(email, password);
      return data;
    },
    [API_URL, login]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        refreshUser,
        login,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
