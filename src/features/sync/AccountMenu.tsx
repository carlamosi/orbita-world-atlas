import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { UserCircle2 } from "lucide-react";

export function AccountMenu() {
  const { user, signedIn } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  if (!signedIn) {
    return (
      <Link
        to="/auth"
        search={{ mode: "signup" }}
        className="inline-flex items-center gap-1.5 text-[12px] text-white/90 hover:text-white px-3 py-1.5 rounded-full border border-neon/25 bg-neon/10 hover:bg-neon/15 transition-colors"
        title="Create an account to sync your progress"
      >
        <span aria-hidden>💾</span> Save progress
      </Link>
    );
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-1.5 pr-2.5 py-1 text-[12px] text-white/85 hover:bg-white/10">
          <span className="size-5 grid place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-[10px] font-semibold text-white">
            {initial}
          </span>
          <span className="hidden sm:inline truncate max-w-[120px]">
            {user?.email ?? "Account"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/account" className="cursor-pointer">
            <UserCircle2 className="mr-2 size-4" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account/sync" className="cursor-pointer">
            Sync status
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-rose-300">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
