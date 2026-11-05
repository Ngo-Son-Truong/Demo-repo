import { cn } from "@/lib/utils";

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "relative grid place-items-center rounded-[10px] border",
          light
            ? "border-white/25 bg-white/10"
            : "border-cocoa/20 bg-teal shadow-[2px_2px_0_0_rgba(37,37,37,0.85)]",
        )}
        style={{ width: compact ? 30 : 34, height: compact ? 30 : 34 }}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
          <rect x="2" y="4" width="9" height="7" fill="#F5EBDD" />
          <rect x="3" y="5" width="7" height="5" fill="#76543B" />
          <rect x="11" y="5" width="2" height="4" fill="#F5EBDD" />
          <rect x="2" y="11" width="11" height="1" fill="#252525" />
          <rect x="2" y="3" width="9" height="1" fill="#FFBD59" />
          <rect x="5" y="1" width="1" height="2" fill="#F5EBDD" opacity="0.9" />
          <rect x="8" y="0" width="1" height="2" fill="#F5EBDD" opacity="0.65" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display text-[15px] font-extrabold tracking-[0.18em]",
              light ? "text-parchment" : "text-ink",
            )}
          >
            CHILLSPACE
          </span>
          <span
            className={cn(
              "mt-1 font-mono text-[8px] uppercase tracking-[0.3em]",
              light ? "text-parchment/60" : "text-cocoa/55",
            )}
          >
            lounge · 24/7
          </span>
        </span>
      )}
    </div>
  );
}
