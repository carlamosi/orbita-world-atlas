import { createFileRoute } from "@tanstack/react-router";
import NamePage from "@/features/name/NamePage";

export const Route = createFileRoute("/name")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Name It — Orbita" },
      { name: "description", content: "Name the mystery country zoomed in from orbit." },
    ],
  }),
  component: NamePage,
});
