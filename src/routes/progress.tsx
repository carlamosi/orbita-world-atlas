import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ProgressPage = lazy(() => import("@/features/progress/ProgressPage"));

export const Route = createFileRoute("/progress")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Progress — Orbita" },
      { name: "description", content: "Confidence heatmaps, streaks, weak spots, and per-continent mastery." },
    ],
  }),
  component: () => (
    <Suspense fallback={null}>
      <ProgressPage />
    </Suspense>
  ),
});
