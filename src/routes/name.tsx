import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/layout/StubPage";

export const Route = createFileRoute("/name")({
  head: () => ({ meta: [{ title: "Name It — Orbita" }] }),
  component: () => (
    <StubPage
      path="/name"
      title="Name the mystery country"
      blurb="A country zooms in from orbit. Type its name. Easy and Hard variants with keyboard-first interaction."
    />
  ),
});
