"use client";

import { ArrowRight, Lock, Mic, MicOff, Users, X } from "lucide-react";
import type { CafeTable } from "@/lib/types";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { PublicTableIndicator } from "@/components/table/PublicTableIndicator";
import { PrivateTableIndicator } from "@/components/table/PrivateTableIndicator";
import { cn } from "@/lib/utils";

interface TablePreviewProps {
  table: CafeTable;
  onClose: () => void;
  onJoin: () => void;
  onShare: () => void;
}

export function TablePreview({ table, onClose, onJoin, onShare }: TablePreviewProps) {
  const free = table.capacity - table.participants.length;
  const full = free <= 0;

  return (
    <div className="pointer-events-auto w-[312px] max-w-[calc(100vw-2rem)] animate-popIn rounded-[18px] border border-cocoa/20 bg-parchment/[0.97] p-3 shadow-panel backdrop-blur">
      <div className="flex items-center gap-1.5">
        {table.visibility === "public" ? <PublicTableIndicator /> : <PrivateTableIndicator />}
        <span className="inline-flex items-center gap-1 rounded-full border border-cocoa/15 bg-white/60 px-1.5 py-0.5 text-[9.5px] font-medium text-cocoa/70">
          {table.voiceEnabled ? <Mic className="h-2.5 w-2.5" /> : <MicOff className="h-2.5 w-2.5" />}
          {table.voiceEnabled ? "Voice" : "Chat"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin bàn"
          className="focus-ring ml-auto rounded-full border border-cocoa/15 bg-white/60 p-1 text-cocoa/55 transition hover:text-cocoa"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[14.5px] font-semibold tracking-tight text-ink">
            {table.name}
          </h3>
          <p className="mt-0.5 truncate text-[10.5px] leading-relaxed text-cocoa/60">{table.topic}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1 font-mono text-[10px] text-cocoa/65">
            <Users className="h-2.5 w-2.5" />
            {table.participants.length}/{table.capacity}
          </p>
          <p className={cn("text-[9px]", full ? "text-[#B4543F]" : "text-tealDeep")}>
            {full ? "đã đầy" : `còn ${free} chỗ`}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex shrink-0 -space-x-1.5">
            {table.participants.slice(0, 3).map((participant) => (
              <span
                key={`face-${participant.id}`}
                className="grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-full border-2 border-parchment bg-[#EADCC6]"
                title={participant.nickname}
              >
                <AvatarSprite avatarId={participant.avatarId} size={18} animate={false} />
              </span>
            ))}
          </div>
          <span className="truncate text-[9.5px] leading-tight text-cocoa/55">
            {table.participants.some((p) => p.speaking)
              ? `${table.participants.find((p) => p.speaking)?.nickname} đang nói`
              : table.participants.length > 0
                ? `cùng ${table.participants[0].nickname}`
                : "chưa có ai ngồi"}
          </span>
        </div>

        <button
          type="button"
          onClick={onJoin}
          disabled={full}
          className={cn(
            "focus-ring group ml-auto flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition",
            full
              ? "cursor-not-allowed bg-cocoa/10 text-cocoa/40"
              : "bg-ink text-parchment shadow-[0_8px_16px_-12px_rgba(0,0,0,0.9)] hover:-translate-y-0.5 hover:bg-cocoaDark",
          )}
        >
          {full ? "Đã đầy" : table.visibility === "private" ? "Vào bàn" : "Tham gia"}
          {!full && <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </div>

      {table.visibility === "private" && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-honeyDeep/30 bg-honey/[0.12] px-2 py-1">
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#8A5A16]">
            <Lock className="h-2.5 w-2.5" /> mã mời
          </span>
          <button
            type="button"
            onClick={onShare}
            className="focus-ring rounded font-mono text-[10px] font-bold tracking-[0.18em] text-cocoaDark underline decoration-dotted underline-offset-2"
          >
            {table.inviteCode}
          </button>
        </div>
      )}
    </div>
  );
}
