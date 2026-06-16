import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/speed")({
  head: () => ({ meta: [{ title: "Speed Round — Orbita" }] }),
  component: () => (
    <StubPage
      path="/speed"
      title="60-second orbital sprint"
      blurb="SVG timer, QPM metrics, personal records, and continent filters. Pure reflex."
    />
  ),
});
