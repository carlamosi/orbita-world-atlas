import { useMemo } from "react";

interface Props {
  density?: number;
  className?: string;
}

// Pure CSS starfield: three parallax layers of pseudo-stars.
// Cheap, GPU friendly, ambient.
export function Starfield({ density = 120, className }: Props) {
  const layers = useMemo(() => {
    const makeShadow = (count: number, spread: number) =>
      Array.from({ length: count }, () => {
        const x = Math.floor(Math.random() * spread);
        const y = Math.floor(Math.random() * spread);
        const a = (Math.random() * 0.7 + 0.3).toFixed(2);
        return `${x}px ${y}px 0 rgba(255,255,255,${a})`;
      }).join(",");
    return {
      a: makeShadow(density, 2000),
      b: makeShadow(Math.floor(density * 0.5), 2000),
      c: makeShadow(Math.floor(density * 0.25), 2000),
    };
  }, [density]);

  const Layer = ({
    shadow,
    size,
    duration,
  }: {
    shadow: string;
    size: number;
    duration: number;
  }) => (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        animation: `orbit-drift ${duration}s linear infinite`,
        animationDirection: "alternate",
      }}
    >
      <div
        className="absolute"
        style={{
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          background: "transparent",
          boxShadow: shadow,
        }}
      />
    </div>
  );

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      <Layer shadow={layers.a} size={1} duration={240} />
      <Layer shadow={layers.b} size={1.5} duration={360} />
      <Layer shadow={layers.c} size={2} duration={520} />
    </div>
  );
}
