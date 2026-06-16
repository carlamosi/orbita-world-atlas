import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/flags")({
  head: () => ({ meta: [{ title: "Flags — Orbita" }] }),
  component: () => (
    <StubPage
      path="/flags"
      title="Flag mastery"
      blurb="Flag → Country and Country → Flag, with cinematic transitions and adaptive difficulty."
    />
  ),
});
