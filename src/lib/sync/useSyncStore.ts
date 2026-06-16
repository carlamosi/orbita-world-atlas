import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "queued" | "synced" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  queued: number;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastError: string | null;
  signedIn: boolean;
  setStatus: (s: SyncStatus) => void;
  setQueued: (n: number) => void;
  setLastPush: (t: number) => void;
  setLastPull: (t: number) => void;
  setError: (e: string | null) => void;
  setSignedIn: (v: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  queued: 0,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
  signedIn: false,
  setStatus: (status) => set({ status }),
  setQueued: (queued) => set({ queued }),
  setLastPush: (t) => set({ lastPushAt: t }),
  setLastPull: (t) => set({ lastPullAt: t }),
  setError: (lastError) => set({ lastError }),
  setSignedIn: (signedIn) => set({ signedIn }),
}));
