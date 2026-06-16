import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  violet: "text-[color:var(--violet)] border-[color:var(--violet)]/30 bg-[color:var(--violet)]/10",
  cyan: "text-[color:var(--cyan)] border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/10",
  neon: "text-[color:var(--neon)] border-[color:var(--neon)]/30 bg-[color:var(--neon)]/10",
  coral: "text-[color:var(--coral)] border-[color:var(--coral)]/30 bg-[color:var(--coral)]/10",
  muted: "text-white/60 border-white/10 bg-white/5",
} as const;

export function Badge({
  tone = "muted",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide uppercase font-mono",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
