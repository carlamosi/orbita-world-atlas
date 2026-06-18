import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authDebug } from "@/lib/auth/debug";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password · Orbita" }] }),
  component: ResetPasswordPage,
});

function scorePassword(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      authDebug("reset password event", { event, hasSession: !!session, userId: session?.user.id });
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      authDebug("reset password session restore", { hasSession: !!data.session, userId: data.session?.user.id });
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const score = useMemo(() => scorePassword(password), [password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      authDebug("reset password update:start");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      authDebug("reset password update:success");
      toast.success("Password updated");
      router.navigate({ to: "/" });
    } catch (err) {
      authDebug("reset password update:failed", { error: err instanceof Error ? err.message : String(err) });
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 pt-24 pb-12">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <Link
          to="/auth"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
        <h1 className="mt-5 font-display text-[26px] font-semibold text-foreground">
          Set a new password
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {ready
            ? "Choose a strong password you'll remember."
            : "Open this page from the reset link in your email."}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <div className="relative rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-cyan/60">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-transparent pl-10 pr-10 py-2.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {password && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div
                animate={{ width: `${(score / 5) * 100}%` }}
                className="h-full rounded-full"
                style={{
                  background:
                    score <= 1
                      ? "var(--coral)"
                      : score <= 3
                        ? "var(--cyan)"
                        : "var(--neon)",
                }}
              />
            </div>
          )}

          <div className="relative rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-cyan/60">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full bg-transparent pl-10 pr-3 py-2.5 text-sm outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !ready}
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, var(--violet), var(--cyan))",
              boxShadow:
                "0 10px 40px -10px color-mix(in oklab, var(--violet) 60%, transparent)",
            }}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Update password
            </span>
          </button>
        </form>
      </motion.section>
    </main>
  );
}
