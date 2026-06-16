import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ExplorerPage = lazy(() => import("@/features/explorer/ExplorerPage"));

export const Route = createFileRoute("/explorer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Explorer — Orbita" },
      {
        name: "description",
        content: "Browse the living atlas: spin the globe, pick a country, see your mastery in real time.",
      },
    ],
  }),
  component: () => (
    <Suspense fallback={null}>
      <ExplorerPage />
    </Suspense>
  ),
});
