import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PrivateTableIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-honeyDeep/35 bg-honey/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A5A16]",
        className,
      )}
    >
      <Lock className="h-3 w-3" />
      Riêng tư
    </span>
  );
}
