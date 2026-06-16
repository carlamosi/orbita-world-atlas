import { createFileRoute } from "@tanstack/react-router";
import CapitalsPage from "@/features/capitals/CapitalsPage";

export const Route = createFileRoute("/capitals")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Capitals — Orbita" },
      { name: "description", content: "Match the world's seats of power." },
    ],
  }),
  component: CapitalsPage,
});
