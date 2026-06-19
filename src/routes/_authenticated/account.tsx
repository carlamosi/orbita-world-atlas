import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/account.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account · Orbita" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_flag")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const displayName =
    profileQ.data?.display_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Orbita Explorer";

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    const { swap } = await import("@/lib/db/dbProvider");
    await swap(null);
    router.navigate({ to: "/", replace: true });
  };

  const handleDelete = async () => {
    if (confirm !== "DELETE") return;
    setDeleting(true);
    try {
      await deleteAccount();
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      const { swap } = await import("@/lib/db/dbProvider");
      await swap(null);
      toast.success("Your account has been deleted.");
      router.navigate({ to: "/auth", replace: true });
    } catch (e) {
      setDeleting(false);
      toast.error(
        e instanceof Error ? e.message : "Couldn't delete the account.",
      );
    }
  };

  return (
    <main className="min-h-dvh px-4 pt-28 pb-16 max-w-3xl mx-auto">
      <h1 className="text-3xl font-display font-semibold text-white">Account</h1>
      <p className="mt-1 text-sm text-white/60">
        Your Orbita identity and sync settings.
      </p>

      <section className="mt-8 glass rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-white/50">
          Identity
        </h2>
        <div className="mt-3 text-sm text-white/85">
          <div className="font-display text-2xl text-white tracking-tight">
            {displayName}
          </div>
          <div className="text-[12px] text-white/55 mt-1">{user?.email}</div>
          <div className="text-[10px] font-mono text-white/35 mt-2">
            User ID: {user?.id}
          </div>
        </div>
      </section>

      <section className="mt-4 glass rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-white/50">Sync</h2>
        <p className="mt-2 text-sm text-white/70">
          Your progress is mirrored to the cloud automatically. Game data lives
          locally for instant play.
        </p>
        <Link
          to="/account/sync"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
        >
          View sync status →
        </Link>
      </section>

      <section className="mt-4 glass rounded-2xl p-6">
        <h2 className="text-sm uppercase tracking-wider text-white/50">
          Session
        </h2>
        <button
          onClick={signOut}
          className="mt-3 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
        >
          Sign out
        </button>
      </section>

      <section className="mt-4 glass rounded-2xl p-6 border-rose-500/15">
        <h2 className="text-sm uppercase tracking-wider text-rose-300/80">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Permanently deletes your profile, progress, sessions, unlocks, and
          streak across every device. This cannot be undone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="rounded-full bg-black/30 border border-white/15 px-3 py-1.5 text-xs text-white placeholder:text-white/40 outline-none focus:border-rose-400/50 min-w-[220px]"
          />
          <button
            disabled={confirm !== "DELETE" || deleting}
            onClick={handleDelete}
            className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-xs font-medium text-rose-100 hover:bg-rose-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </section>
    </main>
  );
}
