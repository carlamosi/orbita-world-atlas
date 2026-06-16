import type { Transition, Variants } from "framer-motion";

// Orbital spring system — never use linear easing in the app.
export const spring = {
  soft: { type: "spring", stiffness: 120, damping: 22, mass: 0.9 } as Transition,
  crisp: { type: "spring", stiffness: 280, damping: 28, mass: 0.6 } as Transition,
  heavy: { type: "spring", stiffness: 80, damping: 20, mass: 1.4 } as Transition,
  micro: { type: "spring", stiffness: 420, damping: 32, mass: 0.4 } as Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

export const stagger = (delayChildren = 0.05, staggerChildren = 0.06): Variants => ({
  hidden: {},
  show: { transition: { delayChildren, staggerChildren } },
});

export const routeTransition: Variants = {
  initial: { opacity: 0, y: 16, filter: "blur(10px)" },
  enter: { opacity: 1, y: 0, filter: "blur(0px)", transition: spring.soft },
  exit: { opacity: 0, y: -12, filter: "blur(8px)", transition: { duration: 0.2 } },
};
