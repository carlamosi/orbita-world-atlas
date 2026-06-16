import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { routeTransition } from "@/lib/motion";

export function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.main
      variants={routeTransition}
      initial="initial"
      animate="enter"
      exit="exit"
      className="relative z-10"
    >
      {children}
    </motion.main>
  );
}
