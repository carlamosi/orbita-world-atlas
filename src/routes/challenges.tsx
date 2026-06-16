import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Orbita" }] }),
  component: () => (
    <StubPage
      path="/challenges"
      title="The 195, and beyond"
      blurb="Continent Speedruns, Perfect Continent, Blind Mode, Flag Master, Speed Demon — with atmospheric unlock animations."
    />
  ),
});
