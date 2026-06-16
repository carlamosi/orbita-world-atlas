import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account · Orbita" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  };

  return (
    <main className="min-h-dvh px-4 pt-28 pb-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-display font-semibold text-white">Account</h1>
      <p className="mt-1 text-sm text-white/60">
        Your Orbita identity and sync settings.
      </p>

      <section className="mt-8 glass rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-white/50">Identity</h2>
        <div className="mt-3 text-sm text-white/85">
          <div>{user?.email}</div>
          <div className="text-[11px] text-white/40 mt-1">User ID: {user?.id}</div>
        </div>
      </section>

      <section className="mt-4 glass rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-white/50">Sync</h2>
        <p className="mt-2 text-sm text-white/70">
          Your progress is mirrored to the cloud automatically. Game data lives locally
          for instant play.
        </p>
        <Link
          to="/account/sync"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
        >
          View sync status →
        </Link>
      </section>

      <section className="mt-4 glass rounded-2xl p-6 border-rose-500/15">
        <h2 className="text-sm uppercase tracking-wider text-rose-300/80">Danger zone</h2>
        <button
          onClick={signOut}
          className="mt-3 inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
