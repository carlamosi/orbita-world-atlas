import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PullResult, PushResult } from "./types";

const MutationSchema = z.object({
  op_id: z.string().uuid(),
  entity: z.enum([
    "sessions_log",
    "country_progress",
    "challenge_attempts",
    "unlocks",
    "daily_streak",
    "profiles",
  ]),
  op: z.enum(["insert", "upsert"]),
  payload: z.record(z.string(), z.unknown()),
});

const PushSchema = z.object({
  mutations: z.array(MutationSchema).max(100),
});

export const syncPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PushSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("sync_push", {
      _mutations: data.mutations as never,
    });
    if (error) throw new Error(error.message);
    return out as unknown as PushResult;
  });

const PullSchema = z.object({
  cursors: z.record(z.string(), z.string().nullable()).default({}),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const syncPull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PullSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("sync_pull", {
      _cursors: data.cursors as never,
      _limit: data.limit ?? 500,
    });
    if (error) throw new Error(error.message);
    return out as unknown as PullResult;
  });
