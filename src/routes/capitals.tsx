import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/capitals")({
  head: () => ({ meta: [{ title: "Capitals — Orbita" }] }),
  component: () => (
    <StubPage
      path="/capitals"
      title="The seats of power"
      blurb="Country → Capital, Capital → Country, and Globe Locator. Shared answer engine across modes."
    />
  ),
});
