import { createFileRoute } from "@tanstack/react-router";
import FindPage from "@/features/find/FindPage";

export const Route = createFileRoute("/find")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Find It — Orbita" },
      { name: "description", content: "Pinpoint countries on the orbital globe." },
    ],
  }),
  component: FindPage,
});
