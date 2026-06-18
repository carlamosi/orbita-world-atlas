import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authDebug } from "./debug";

function profileName(user: User, fallbackName?: string) {
  const metadata = user.user_metadata ?? {};
  const candidate =
    fallbackName?.trim() ||
    String(metadata.display_name ?? metadata.full_name ?? metadata.name ?? "").trim() ||
    user.email?.split("@")[0] ||
    "Orbita Explorer";
  return candidate.slice(0, 60);
}

export async function ensureUserProfile(user: User, fallbackName?: string) {
  authDebug("profile ensure:start", { userId: user.id, hasFallbackName: !!fallbackName });
  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) {
    authDebug("profile ensure:lookup failed", { userId: user.id, error: lookupError.message });
    throw lookupError;
  }

  if (existing) {
    authDebug("profile ensure:exists", { userId: user.id });
    return;
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    display_name: profileName(user, fallbackName),
  });

  if (insertError) {
    authDebug("profile ensure:insert failed", { userId: user.id, error: insertError.message });
    throw insertError;
  }

  authDebug("profile ensure:created", { userId: user.id });
}