import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
}

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-[15px]",
  lg: "h-14 px-8 text-base",
};

const variants: Record<Variant, string> = {
  primary:
    "text-white border border-white/15 " +
    "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--violet)_92%,white_8%),color-mix(in_oklab,var(--violet)_75%,black_25%))] " +
    "shadow-[0_8px_30px_-10px_color-mix(in_oklab,var(--violet)_70%,transparent)] " +
    "hover:shadow-[0_14px_44px_-10px_color-mix(in_oklab,var(--violet)_85%,transparent)]",
  secondary:
    "glass text-white/90 hover:text-white",
  ghost:
    "text-white/70 hover:text-white hover:bg-white/5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", children, ...props },
    ref,
  ) {
    return (
      <motion.button
        ref={ref}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        transition={spring.micro}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight",
          "relative overflow-hidden select-none outline-none focus-visible:ring-2 focus-visible:ring-cyan/60",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          sizes[size],
          variants[variant],
          className,
        )}
        {...props}
      >
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      </motion.button>
    );
  },
);
