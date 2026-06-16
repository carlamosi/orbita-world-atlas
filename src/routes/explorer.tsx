import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Explorer — Orbita" },
      { name: "description", content: "Browse the living atlas: globe, borders, and country detail panel." },
    ],
  }),
  component: () => (
    <StubPage
      path="/explorer"
      title="The living atlas"
      blurb="Globe + country detail, confidence heatmaps, border visualization, and cinematic POV transitions. Landing in the next phase."
    />
  ),
});
