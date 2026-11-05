"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, UserPlus, Volume2 } from "lucide-react";
import { CafeWorld } from "@/lib/world/CafeWorld";
import type { CafeTable, UserProfile } from "@/lib/types";
import { TablePreview } from "@/components/table/TablePreview";
import { cn } from "@/lib/utils";

interface PixelWorldProps {
  tables: CafeTable[];
  profile: UserProfile;
  activeTableId: string | null;
  selectedTableId: string | null;
  bubbles: Record<string, { text: string; at: number }>;
  onSelectTable: (tableId: string | null) => void;
  onJoinTable: (tableId: string) => void;
  onCreateTable: () => void;
  onOpenInvite: () => void;
  onShare: (table: CafeTable) => void;
  onlineCount: number;
}

export function PixelWorld({
  tables,
  profile,
  activeTableId,
  selectedTableId,
  bubbles,
  onSelectTable,
  onJoinTable,
  onCreateTable,
  onOpenInvite,
  onShare,
  onlineCount,
}: PixelWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<CafeWorld | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // A phone-sized room only has space for a few tables — keep the scene legible.
  const worldTables =
    narrow && tables.length > 3
      ? tables.filter(
          (table, index) => index < 3 || table.id === activeTableId || table.id === selectedTableId,
        )
      : tables;

  const stateRef = useRef({
    tables: worldTables,
    profile,
    activeTableId,
    selectedTableId,
    bubbles,
    onSelectTable,
    onJoinTable,
  });
  stateRef.current = {
    tables: worldTables,
    profile,
    activeTableId,
    selectedTableId,
    bubbles,
    onSelectTable,
    onJoinTable,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new CafeWorld(canvas, {
      tables: stateRef.current.tables,
      profile: stateRef.current.profile,
      activeTableId: stateRef.current.activeTableId,
      selectedTableId: stateRef.current.selectedTableId,
      bubbles: stateRef.current.bubbles,
      callbacks: {
        onSelectTable: (id) => stateRef.current.onSelectTable(id),
        onJoinTable: (id) => stateRef.current.onJoinTable(id),
      },
    });
    worldRef.current = world;
    world.start();
    return () => {
      world.destroy();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.setProps({
      tables: worldTables,
      profile,
      activeTableId,
      selectedTableId,
      bubbles,
      callbacks: {
        onSelectTable: (id) => stateRef.current.onSelectTable(id),
        onJoinTable: (id) => stateRef.current.onJoinTable(id),
      },
    });
  }, [worldTables, profile, activeTableId, selectedTableId, bubbles]);

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;

  return (
    <section
      className="relative min-h-[190px] flex-[3] overflow-hidden rounded-[22px] border border-cocoa/25 bg-[#1F1713] shadow-panel max-lg:h-[248px] max-lg:min-h-0 max-lg:flex-none"
      aria-label="Thế giới pixel 2D — sảnh quán cà phê"
    >
      <canvas
        ref={canvasRef}
        className="pixelated absolute inset-0 h-full w-full touch-none"
        tabIndex={-1}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 via-black/10 to-transparent p-2.5">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-parchment/85 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7BD389]" />
            sảnh lounge
          </span>
          <span className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[10px] text-parchment/60 backdrop-blur sm:flex">
            {onlineCount} người online
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenInvite}
            className="focus-ring hidden items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[11px] font-medium text-parchment/80 backdrop-blur transition hover:border-white/35 hover:text-parchment sm:flex"
          >
            <UserPlus className="h-3 w-3" /> Mời bạn
          </button>
          <button
            type="button"
            onClick={onCreateTable}
            className="focus-ring flex items-center gap-1.5 rounded-full bg-honey px-2.5 py-1 text-[11px] font-semibold text-ink shadow-[0_4px_14px_-6px_rgba(0,0,0,0.8)] transition hover:-translate-y-0.5 hover:bg-[#FFCB77]"
          >
            <Plus className="h-3 w-3" /> Tạo bàn
          </button>
        </div>
      </div>

      {(selectedTable || activeTableId) && (
        <div
          className="absolute bottom-2.5 z-10 transition-[left] duration-200"
          style={{
            left: `clamp(10px, calc(${Math.round((selectedTable?.position.x ?? 0.5) * 100)}% - 156px), calc(100% - 322px))`,
          }}
        >
          {selectedTable ? (
            <TablePreview
              table={selectedTable}
              onClose={() => onSelectTable(null)}
              onJoin={() => onJoinTable(selectedTable.id)}
              onShare={() => onShare(selectedTable)}
            />
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-parchment/70 backdrop-blur">
              <Volume2 className="h-3 w-3 text-honey" />
              đang ở bàn — nhạc nền vẫn tiếp tục
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute bottom-2.5 right-2.5 hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-parchment/45 lg:flex",
        )}
      >
        <kbd className="rounded border border-white/20 bg-black/25 px-1.5 py-0.5">W</kbd>
        <kbd className="rounded border border-white/20 bg-black/25 px-1.5 py-0.5">A</kbd>
        <kbd className="rounded border border-white/20 bg-black/25 px-1.5 py-0.5">S</kbd>
        <kbd className="rounded border border-white/20 bg-black/25 px-1.5 py-0.5">D</kbd>
        <span className="ml-1">di chuyển · click bàn để xem · E để vào</span>
      </div>
    </section>
  );
}
