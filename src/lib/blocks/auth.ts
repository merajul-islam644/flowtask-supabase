import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { isLoginConfigured } from "./config";

const RETURN_TO_KEY = "flowtask.blocks.returnTo";

/** The session-claims shape the app consumes (sub/email/name only — the old
    IAM userInfo type carried far more than anything downstream reads). */
export interface SessionClaims {
  sub: string;
  email?: string;
  name?: string;
}

function claimsFromSession(session: Session | null): SessionClaims | null {
  const user = session?.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    [meta.first_name, meta.last_name]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .trim() ||
    undefined;
  return {
    sub: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
    name,
  };
}

/** Stash the intended destination, then hand off to an OAuth provider flow.
    The regular path is the email/password form on LoginPage — startLogin only
    matters when a provider (e.g. Google) is enabled on the project. */
export async function startLogin(returnTo: string = "/"): Promise<void> {
  if (!isLoginConfigured()) {
    throw new Error(
      "Login is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.",
    );
  }
  sessionStorage.setItem(RETURN_TO_KEY, returnTo);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/login/callback` },
  });
  if (error) throw new Error(error.message);
}

export type CompleteLoginResult = {
  ok: boolean;
  returnTo: string;
  message?: string;
};

/** Finish a redirect-based sign-in (OAuth/magic link) on /login/callback.
    PKCE codes are exchanged explicitly; hash/token flows are picked up by
    detectSessionInUrl. Email/password sign-ins never come through here. */
export async function completeLogin(callbackUrl: string): Promise<CompleteLoginResult> {
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY) ?? "/";
  sessionStorage.removeItem(RETURN_TO_KEY);
  try {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, returnTo, message: error.message };
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) return { ok: false, returnTo, message: error.message };
    if (!data.session) return { ok: false, returnTo, message: "No active session after sign-in." };
    return { ok: true, returnTo };
  } catch (error) {
    return {
      ok: false,
      returnTo,
      message: error instanceof Error ? error.message : "Sign-in failed.",
    };
  }
}

/** Email + password sign-in for the login form. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      error.message === "Invalid login credentials"
        ? "Wrong email or password."
        : error.message,
    );
  }
}

export type SignUpResult = { needsEmailConfirmation: boolean };

/** Create a new account. When the project has email confirmation on, there is
    no session yet — the caller shows the check-your-inbox message. */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw new Error(error.message);
  return { needsEmailConfirmation: !data.session };
}

/** Ask Supabase directly — the only source of truth. Returns null when signed out. */
export async function fetchSessionClaims(): Promise<SessionClaims | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return claimsFromSession(data.session);
}

/** End the session; local tokens are cleared server-side. */
export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Already signed out — the refresh below settles state.
  }
}
