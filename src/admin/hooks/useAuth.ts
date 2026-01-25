/**
 * Auth state hook for admin UI.
 * Manages authentication state, login/logout, and session checking.
 */

import { useState, useEffect, useCallback } from "react";

interface Admin {
  id: string;
  email: string;
}

interface UseAuthReturn {
  admin: Admin | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

/**
 * Hook for managing admin authentication state.
 * Checks for existing token on mount and provides login/logout functions.
 *
 * @returns Auth state and actions
 */
export function useAuth(): UseAuthReturn {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("bunbase_token");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/_/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAdmin(data);
      } else {
        // Token invalid or expired
        localStorage.removeItem("bunbase_token");
      }
    } catch (e) {
      console.error("Auth check failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    const response = await fetch("/_/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Login failed");
    }
    const { token, admin: adminData } = await response.json();
    localStorage.setItem("bunbase_token", token);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem("bunbase_token");
    setAdmin(null);
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    admin,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!admin,
  };
}
