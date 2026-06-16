import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  iso2: string;
  alt: string;
  className?: string;
  size?: 320 | 640 | 1280;
}

export function FlagImage({ iso2, alt, className, size = 320 }: Props) {
  const [loaded, setLoaded] = useState(false);
  const code = iso2.toLowerCase();
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl glass",
        !loaded && "animate-pulse",
        className,
      )}
    >
      <img
        src={`https://flagcdn.com/w${size}/${code}.png`}
        srcSet={`https://flagcdn.com/w${size}/${code}.png 1x, https://flagcdn.com/w${size * 2}/${code}.png 2x`}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "block w-full h-full object-cover transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
