import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ChallengesPage = lazy(() => import("@/features/challenges/ChallengesPage"));

export const Route = createFileRoute("/challenges")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Challenges — Orbita" },
      { name: "description", content: "Daily and weekly orbit runs — deterministic question sets, your best score." },
    ],
  }),
  component: () => (
    <Suspense fallback={null}>
      <ChallengesPage />
    </Suspense>
  ),
});
