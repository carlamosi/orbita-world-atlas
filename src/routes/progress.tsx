import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Progress — Orbita" }] }),
  component: () => (
    <StubPage
      path="/progress"
      title="Mastery dashboard"
      blurb="Confidence heatmaps, streaks, weak spots, and regional progress — sourced from your real sessions."
    />
  ),
});
