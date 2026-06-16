import { create } from "zustand";
import { useEffect } from "react";
import { useSyncStore } from "@/lib/sync/useSyncStore";
import { useRouter } from "@tanstack/react-router";
import { Cloud, CloudOff, RefreshCw, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncPill() {
  const status = useSyncStore((s) => s.status);
  const queued = useSyncStore((s) => s.queued);
  const signedIn = useSyncStore((s) => s.signedIn);
  const router = useRouter();
  if (!signedIn) return null;

  let Icon = Cloud;
  let label = "Synced";
  let tone = "text-emerald-300";
  if (status === "syncing") {
    Icon = RefreshCw;
    label = "Syncing…";
    tone = "text-cyan-300";
  } else if (status === "queued") {
    Icon = Cloud;
    label = `Queued (${queued})`;
    tone = "text-amber-300";
  } else if (status === "offline") {
    Icon = CloudOff;
    label = "Offline";
    tone = "text-white/60";
  } else if (status === "error") {
    Icon = AlertCircle;
    label = "Error";
    tone = "text-rose-300";
  } else if (status === "synced") {
    Icon = Check;
    label = "Synced";
    tone = "text-emerald-300";
  }

  return (
    <button
      onClick={() => router.navigate({ to: "/account/sync" })}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px]",
        tone,
      )}
      title="Cloud sync"
    >
      <Icon className={cn("size-3", status === "syncing" && "animate-spin")} />
      <span>{label}</span>
    </button>
  );
}

// Hook for the navbar so we can refresh queued count occasionally
const useTick = create<{ t: number; tick: () => void }>((set) => ({
  t: 0,
  tick: () => set((s) => ({ t: s.t + 1 })),
}));

export function useSyncRefreshTicker() {
  const tick = useTick((s) => s.tick);
  useEffect(() => {
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [tick]);
}
