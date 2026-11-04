import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublicTableIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tealDeep",
        className,
      )}
    >
      <Globe2 className="h-3 w-3" />
      Công khai
    </span>
  );
}
