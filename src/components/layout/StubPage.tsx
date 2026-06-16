import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { spring } from "@/lib/motion";

function makeStub(path: string, title: string, blurb: string, eta = "Phase 2") {
  function StubPage() {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
          transition={spring.soft}
          className="glass-strong rounded-3xl p-12 max-w-xl text-center relative overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-60"
            style={{
              background:
                "radial-gradient(300px 200px at 50% 0%, rgba(108,99,255,0.35), transparent 60%)",
            }}
          />
          <Badge tone="cyan">{eta}</Badge>
          <h1 className="mt-6 font-display text-4xl md:text-5xl font-semibold text-white tracking-tight text-glow-violet">
            {title}
          </h1>
          <p className="mt-4 text-white/60 text-[15px] leading-relaxed">{blurb}</p>
          <div className="mt-10 flex gap-3 justify-center">
            <Link to="/find">
              <Button>Play Find It</Button>
            </Link>
            <Link to="/">
              <Button variant="secondary">Home</Button>
            </Link>
          </div>
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
            {path}
          </p>
        </motion.div>
      </div>
    );
  }
  return StubPage;
}

export const _make = makeStub;

/* This file exports the stub factory used by each placeholder route. */
export const Route = createFileRoute("/_stub_unused")({
  component: () => null,
}) as unknown as never;
