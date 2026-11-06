import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListChecks, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/app/providers/AuthProvider";
import { useI18n } from "@/lib/i18n";
import { isLoginConfigured } from "@/lib/blocks/config";
import { signInWithPassword, signUp } from "@/lib/blocks/auth";

/**
 * Email + password sign-in against Supabase Auth, with a sign-up toggle.
 * Replaces the old hosted-OIDC hand-off; the /login/callback route stays for
 * provider/magic-link flows and is still handled by CallbackPage.
 */
export function LoginPage() {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const configured = isLoginConfigured();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        await signInWithPassword(email.trim(), password);
        await refresh();
        navigate(returnTo, { replace: true });
      } else {
        const result = await signUp(email.trim(), password, name.trim());
        if (result.needsEmailConfirmation) {
          setNotice(
            "Account created. Check your inbox for the confirmation email, then sign in here.",
          );
          setMode("signin");
        } else {
          await refresh();
          navigate(returnTo, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-ctl bg-accent-solid text-on-accent">
            <ListChecks size={16} aria-hidden />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-ink">FlowTask</h1>
            <p className="text-xs text-ink-2">{t("auth.tagline", "Tasks, projects and focus in one place.")}</p>
          </div>
        </div>

        {configured ? (
          <>
            <p className="mt-5 text-[13px] leading-relaxed text-ink-2">
              {mode === "signin"
                ? t("auth.signInPrompt", "Sign in to your workspace to continue.")
                : "Create your account — it takes a minute."}
            </p>
            <form className="mt-4 space-y-3" onSubmit={(event) => void onSubmit(event)}>
              {mode === "signup" ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-2">Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required={mode === "signup"}
                    className="w-full rounded-ctl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent-solid"
                    placeholder="Alex Rivera"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-2">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="w-full rounded-ctl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent-solid"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-2">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  className="w-full rounded-ctl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent-solid"
                  placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
                />
              </label>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                type="submit"
                disabled={pending}
              >
                {mode === "signin" ? (
                  <>
                    <LogIn size={15} aria-hidden />
                    {pending ? t("auth.redirecting", "Signing in…") : t("auth.signIn", "Sign in")}
                  </>
                ) : (
                  <>
                    <UserPlus size={15} aria-hidden />
                    {pending ? "Creating account…" : "Create account"}
                  </>
                )}
              </Button>
            </form>
            {error ? (
              <p role="alert" className="mt-3 rounded-ctl border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="mt-3 rounded-ctl border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-2">
                {notice}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              className="mt-4 w-full text-center text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already have an account? Sign in"}
            </button>
          </>
        ) : (
          <p
            role="alert"
            className="mt-5 rounded-ctl border border-danger-line bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger"
          >
            Login is not configured. Set{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in{" "}
            <code className="font-mono">.env</code>, then restart the dev server.
          </p>
        )}
      </div>
    </main>
  );
}
