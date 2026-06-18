import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authDebug } from "@/lib/auth/debug";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      authDebug("state change", { event: _event, hasSession: !!session, userId: session?.user.id });
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      authDebug("session restore", { hasSession: !!data.session, userId: data.session?.user.id });
      if (!data.session) {
        setUser(null);
        setLoading(false);
        return;
      }
      const { data: userData, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !userData.user) {
        authDebug("session restore invalid", { error: error?.message });
        setUser(null);
      } else {
        setUser(userData.user);
      }
      setLoading(false);
    }).catch((error) => {
      if (!mounted) return;
      authDebug("session restore failed", { error: error instanceof Error ? error.message : String(error) });
      setUser(null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading, signedIn: !!user };
}
