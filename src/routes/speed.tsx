import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const SpeedPage = lazy(() => import("@/features/speed/SpeedPage"));

export const Route = createFileRoute("/speed")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Speed Round — Orbita" },
      { name: "description", content: "Sixty seconds. Mixed-skill rapid fire. Build combos for ×5 multipliers." },
    ],
  }),
  component: () => (
    <Suspense fallback={null}>
      <SpeedPage />
    </Suspense>
  ),
});
