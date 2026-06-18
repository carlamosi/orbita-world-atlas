import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, Mail, Lock, ArrowLeft, Check, User as UserIcon } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { authDebug } from "@/lib/auth/debug";
import { ensureUserProfile } from "@/lib/auth/profile";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Orbita" },
      {
        name: "description",
        content:
          "Sign in to Orbita to sync your geography mastery, streaks and challenges across devices.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "check-email";
type Notice = { tone: "success" | "error" | "info"; message: string } | null;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email")
  .max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "Too long");
const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters")
  .max(60, "Too long");

function scorePassword(p: string): { score: number; label: string } {
  if (!p) return { score: 0, label: "" };
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const label = ["Too short", "Weak", "Fair", "Good", "Strong", "Excellent"][s] ?? "";
  return { score: s, label };
}

function friendlyAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Authentication failed");
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  if (/already registered|already been registered|user already/i.test(message)) return "This email already has an account. Try signing in instead.";
  if (/password/i.test(message) && /weak|pwned|compromised/i.test(message)) return "Choose a stronger password that has not appeared in a data breach.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a moment and try again.";
  return message;
}

function AuthPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");

  useEffect(() => {
    if (!authLoading && user) router.navigate({ to: "/" });
  }, [user, authLoading, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = params.get("error_description") || hashParams.get("error_description");
    if (authError) {
      const message = friendlyAuthMessage(new Error(authError));
      authDebug("url auth error", { message });
      setNotice({ tone: "error", message });
      toast.error(message);
    }
  }, []);

  const strength = useMemo(() => scorePassword(password), [password]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    const e = emailSchema.safeParse(email);
    if (!e.success) next.email = e.error.issues[0]?.message;
    if (mode !== "forgot") {
      const p = passwordSchema.safeParse(password);
      if (!p.success) next.password = p.error.issues[0]?.message;
    }
    if (mode === "signup") {
      const n = nameSchema.safeParse(name);
      if (!n.success) next.name = n.error.issues[0]?.message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        authDebug("signin:start", { emailDomain: email.split("@")[1] ?? null });
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        authDebug("signin:success", { userId: data.user?.id, hasSession: !!data.session });
        if (data.user) await ensureUserProfile(data.user);
        toast.success("Welcome back");
        await router.navigate({ to: "/" });
      } else if (mode === "signup") {
        authDebug("signup:start", { emailDomain: email.split("@")[1] ?? null, hasName: !!name.trim() });
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { display_name: name.trim() },
          },
        });
        if (error) throw error;
        authDebug("signup:success", { userId: data.user?.id, hasSession: !!data.session, identities: data.user?.identities?.length ?? null });
        if (data.session && data.user) {
          await ensureUserProfile(data.user, name);
          toast.success("Account created");
          await router.navigate({ to: "/" });
          return;
        }
        setSubmittedEmail(email.trim());
        setNotice({ tone: "success", message: "Account created. Check your inbox and spam folder to confirm your email." });
        toast.success("Account created — check your email to confirm");
        setMode("check-email");
      } else {
        authDebug("password reset:start", { emailDomain: email.split("@")[1] ?? null });
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        authDebug("password reset:sent", { emailDomain: email.split("@")[1] ?? null });
        setNotice({ tone: "success", message: "Reset link sent. Check your inbox and spam folder." });
        toast.success("Reset link sent — check your inbox");
        setMode("signin");
      }
    } catch (err) {
      const message = friendlyAuthMessage(err);
      authDebug("submit:failed", { mode, error: message });
      setNotice({ tone: "error", message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    setNotice(null);
    try {
      authDebug("oauth google:start");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        const message = friendlyAuthMessage(result.error);
        authDebug("oauth google:failed", { error: message });
        setNotice({ tone: "error", message });
        toast.error(message);
        return;
      }
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      authDebug("oauth google:session set", { userId: data.user?.id });
      if (data.user) await ensureUserProfile(data.user);
      await router.navigate({ to: "/" });
    } catch (err) {
      const message = friendlyAuthMessage(err);
      authDebug("oauth google:exception", { error: message });
      setNotice({ tone: "error", message });
      toast.error(message);
    } finally {
      setGoogleBusy(false);
    }
  };

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create your account"
        : mode === "check-email"
          ? "Check your email"
        : "Reset your password";
  const subtitle =
    mode === "signin"
      ? "Continue your journey through every corner of the world."
      : mode === "signup"
        ? "Sync your progress, streaks and unlocks across every device."
        : mode === "check-email"
          ? "Confirm your address to activate ORBITA sync."
        : "We'll email you a secure link to set a new password.";

  return (
    <main className="relative min-h-dvh flex items-center justify-center px-4 pt-24 pb-12">
      {/* Orbital ambience */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="absolute left-1/2 top-[18%] -translate-x-1/2 size-[640px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--violet) 40%, transparent), transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 80, ease: "linear", repeat: Infinity }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[820px] rounded-full border border-white/5"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 120, ease: "linear", repeat: Infinity }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[1100px] rounded-full border border-white/[0.03]"
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong relative w-full max-w-md rounded-3xl p-7 sm:p-9"
      >
        {/* Brand */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to Orbita
        </Link>

        <header className="mt-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="font-display text-[28px] leading-tight font-semibold text-foreground">
                {title}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </header>

        {notice && <AuthNotice notice={notice} />}

        {mode === "check-email" ? (
          <CheckEmailPanel
            email={submittedEmail || email}
            busy={busy}
            onResend={async () => {
              if (!password || !email) {
                setMode("signup");
                return;
              }
              setBusy(true);
              setNotice(null);
              try {
                authDebug("signup resend:start", { emailDomain: email.split("@")[1] ?? null });
                const { error } = await supabase.auth.signUp({
                  email: email.trim(),
                  password,
                  options: {
                    emailRedirectTo: `${window.location.origin}/auth`,
                    data: { display_name: name.trim() },
                  },
                });
                if (error) throw error;
                setNotice({ tone: "success", message: "Confirmation email sent again. Check your inbox and spam folder." });
                toast.success("Confirmation email sent");
              } catch (err) {
                const message = friendlyAuthMessage(err);
                setNotice({ tone: "error", message });
                toast.error(message);
              } finally {
                setBusy(false);
              }
            }}
            onBack={() => {
              setErrors({});
              setMode("signin");
            }}
          />
        ) : (
          <>
        {mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={googleBusy || busy}
              className="mt-7 w-full inline-flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-foreground hover:bg-white/[0.08] hover:border-white/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
            >
              {googleBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              <span className="h-px flex-1 bg-white/10" />
              or with email
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className={mode === "forgot" ? "mt-7 space-y-4" : "space-y-4"} noValidate>
          {mode === "signup" && (
            <Field
              id="name"
              label="Name"
              icon={<UserIcon className="size-4" aria-hidden />}
              error={errors.name}
            >
              <input
                id="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name && validate()}
                required
                maxLength={60}
                className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-err" : undefined}
              />
            </Field>
          )}
          <Field
            id="email"
            label="Email"
            icon={<Mail className="size-4" aria-hidden />}
            error={errors.email}
          >
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@orbit.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email && validate()}
              required
              className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-err" : undefined}
            />
          </Field>

          {mode !== "forgot" && (
            <Field
              id="password"
              label="Password"
              icon={<Lock className="size-4" aria-hidden />}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            >
              <input
                id="password"
                type={showPwd ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signin" ? "Your password" : "At least 8 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => password && validate()}
                required
                minLength={8}
                maxLength={72}
                className="w-full bg-transparent pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-err" : undefined}
              />
            </Field>
          )}

          {mode === "signup" && password.length > 0 && (
            <StrengthBar score={strength.score} label={strength.label} />
          )}

          {mode === "signin" && (
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-xs text-muted-foreground hover:text-cyan transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="group relative w-full overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/70"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--violet) 90%, white 0%), color-mix(in oklab, var(--cyan) 90%, white 0%))",
              boxShadow:
                "0 10px 40px -10px color-mix(in oklab, var(--violet) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <span className="relative inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {mode === "signin"
                ? busy
                  ? "Signing in…"
                  : "Sign in"
                : mode === "signup"
                  ? busy
                    ? "Creating account…"
                    : "Create account"
                  : busy
                    ? "Sending link…"
                    : "Send reset link"}
            </span>
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
          </button>
        </form>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="hover:text-foreground transition-colors"
            >
              ← Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErrors({});
                setNotice(null);
                setMode(mode === "signin" ? "signup" : "signin");
              }}
              className="hover:text-foreground transition-colors"
            >
              {mode === "signin" ? (
                <>
                  New to Orbita? <span className="text-cyan">Create account</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="text-cyan">Sign in</span>
                </>
              )}
            </button>
          )}
          <Link to="/" className="hover:text-foreground transition-colors">
            Continue as guest
          </Link>
        </footer>

        {mode === "signup" && (
          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground/70">
            By creating an account you agree to our terms and acknowledge our privacy
            practices. We use your email only to sync your progress.
          </p>
        )}
          </>
        )}
      </motion.section>
    </main>
  );
}

function AuthNotice({ notice }: { notice: NonNullable<Notice> }) {
  const toneClass =
    notice.tone === "error"
      ? "border-coral/40 bg-coral/10 text-coral"
      : notice.tone === "success"
        ? "border-neon/30 bg-neon/10 text-neon"
        : "border-cyan/30 bg-cyan/10 text-cyan";
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${toneClass}`}
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {notice.message}
    </motion.div>
  );
}

function CheckEmailPanel({
  email,
  busy,
  onResend,
  onBack,
}: {
  email: string;
  busy: boolean;
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div className="mt-7 space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-cyan/30 bg-cyan/10 text-cyan">
          <Mail className="size-5" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">Confirmation sent</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We sent a confirmation link to <span className="text-foreground">{email}</span>. Check your inbox and spam folder.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onResend()}
        disabled={busy}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-foreground hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Resend confirmation email
        </span>
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Back to sign in
      </button>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  error,
  trailing,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div
        className={`relative rounded-xl border bg-white/[0.03] transition-colors focus-within:border-cyan/60 focus-within:bg-white/[0.05] ${
          error ? "border-coral/60" : "border-white/10"
        }`}
      >
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
        {trailing}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-err`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 text-xs text-coral"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function StrengthBar({ score, label }: { score: number; label: string }) {
  const pct = Math.min(100, (score / 5) * 100);
  const color =
    score <= 1
      ? "var(--coral)"
      : score <= 2
        ? "#f5a524"
        : score <= 3
          ? "var(--cyan)"
          : "var(--neon)";
  return (
    <div aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={false}
          animate={{ width: `${pct}%`, backgroundColor: color }}
          transition={{ duration: 0.3 }}
          className="h-full rounded-full"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Password strength</span>
        <span className="inline-flex items-center gap-1" style={{ color }}>
          {score >= 4 && <Check className="size-3" />}
          {label}
        </span>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.45-1.7 4.25-5.5 4.25-3.31 0-6.02-2.74-6.02-6.13S8.69 6.1 12 6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.86 3.5 14.66 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12S6.76 21.5 12 21.5c6.92 0 9.5-4.86 9.5-7.4 0-.5-.05-.88-.12-1.27H12z"
      />
    </svg>
  );
}
