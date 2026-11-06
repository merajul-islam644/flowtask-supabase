import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchSessionClaims, logout as supabaseLogout, startLogin, type SessionClaims } from "@/lib/blocks/auth";
import { supabase } from "@/lib/supabase/client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  claims: SessionClaims | null;
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Single source of truth for session state. Supabase pushes auth changes via
 * onAuthStateChange — no polling needed; a visibility-change refresh stays as
 * a belt-and-braces fallback for tabs that missed a broadcast.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await fetchSessionClaims();
      if (!next) {
        setClaims(null);
        setStatus("unauthenticated");
        return;
      }
      setClaims(next);
      setStatus("authenticated");
    } catch {
      setClaims(null);
      setStatus("unauthenticated");
    } finally {
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  const login = useCallback(async (returnTo?: string) => {
    setStatus("loading");
    try {
      await startLogin(returnTo);
      // OAuth start hands off to the provider; reaching here means it didn't.
      setStatus("unauthenticated");
    } catch (error) {
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await supabaseLogout();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, claims, login, logout, refresh }),
    [status, claims, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

/** Display name from the session claims — email local-part covers accounts
    that have not supplied a name yet. */
export function useDisplayName(): string {
  const { claims } = useAuth();
  return claims?.name?.trim() || claims?.email?.split("@")[0] || "Signed-in user";
}
