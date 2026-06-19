import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently delete the signed-in user's account.
 *
 * 1. Calls `delete_account` RPC (RLS-scoped, removes app rows for auth.uid()).
 * 2. Loads supabaseAdmin INSIDE the handler (never at module scope, since
 *    this file ships in client-reachable route chunks) and deletes the auth user.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error: rpcErr } = await context.supabase.rpc("delete_account");
    if (rpcErr) throw new Error(rpcErr.message);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error: adminErr } = await supabaseAdmin.auth.admin.deleteUser(
      context.userId,
    );
    if (adminErr) throw new Error(adminErr.message);

    return { ok: true };
  });
