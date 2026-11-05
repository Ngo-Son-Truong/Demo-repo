"use client";

import { useState } from "react";
import { ChevronDown, Lock, LockOpen, Maximize2, Share2, Volume2, VolumeX } from "lucide-react";
import type { CafeTable, ChatMessage, Participant } from "@/lib/types";
import { VideoGrid } from "@/components/communication/VideoGrid";
import { ParticipantList } from "@/components/communication/ParticipantList";
import { TextChat } from "@/components/communication/TextChat";
import { MicrophoneControls } from "@/components/communication/MicrophoneControls";
import { PublicTableIndicator } from "@/components/table/PublicTableIndicator";
import { PrivateTableIndicator } from "@/components/table/PrivateTableIndicator";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

interface CommunicationPanelProps {
  table: CafeTable;
  selfId: string;
  messages: ChatMessage[];
  typingName: string | null;
  micOn: boolean;
  cameraOn: boolean;
  cameraStream: MediaStream | null;
  speaking: boolean;
  micLevel: number;
  isHost: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  onInvite: () => void;
  onKick: (participant: Participant) => void;
  onToggleLock: () => void;
  onCollapse: () => void;
  onSendMessage: (text: string) => void;
}

export function CommunicationPanel({
  table,
  selfId,
  messages,
  typingName,
  micOn,
  cameraOn,
  cameraStream,
  speaking,
  micLevel,
  isHost,
  onToggleMic,
  onToggleCamera,
  onLeave,
  onInvite,
  onKick,
  onToggleLock,
  onCollapse,
  onSendMessage,
}: CommunicationPanelProps) {
  const participants = table.participants;
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <aside
      className="flex h-full min-h-0 w-full animate-slideInRight flex-col overflow-hidden rounded-[22px] border border-cocoa/20 bg-parchment/95 shadow-panel backdrop-blur"
      aria-label={`Khu vực giao tiếp của ${table.name}`}
    >
      <header className="relative shrink-0 border-b border-cocoa/10 px-3.5 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.24em] text-cocoa/45">
              đang ở trong bàn
            </p>
            <h2 className="mt-0.5 truncate font-display text-[15px] font-semibold tracking-tight text-ink">
              {table.name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {isHost && (
              <button
                type="button"
                onClick={onToggleLock}
                aria-label={table.locked ? "Mở khoá bàn" : "Khoá bàn"}
                title={table.locked ? "Mở khoá bàn" : "Khoá bàn"}
                className={cn(
                  "focus-ring rounded-lg border p-1.5 transition",
                  table.locked
                    ? "border-honeyDeep/40 bg-honey/20 text-[#8A5A16]"
                    : "border-cocoa/15 bg-white/60 text-cocoa/60 hover:text-cocoa",
                )}
              >
                {table.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={onInvite}
              aria-label="Chia sẻ mã mời"
              className="focus-ring rounded-lg border border-cocoa/15 bg-white/60 p-1.5 text-cocoa/60 transition hover:text-cocoa"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Thu gọn panel giao tiếp"
              className="focus-ring rounded-lg border border-cocoa/15 bg-white/60 p-1.5 text-cocoa/60 transition hover:text-cocoa lg:hidden"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {table.visibility === "public" ? <PublicTableIndicator /> : <PrivateTableIndicator />}
          <span className="inline-flex items-center gap-1 rounded-full border border-cocoa/15 bg-white/60 px-2 py-0.5 text-[10px] font-medium text-cocoa/70">
            {table.voiceEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
            {table.voiceEnabled ? "Voice" : "Chỉ chat"}
          </span>
          {table.locked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#B4543F]/25 bg-[#B4543F]/10 px-2 py-0.5 text-[10px] font-semibold text-[#9C4432]">
              <Lock className="h-2.5 w-2.5" /> đã khoá
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-cocoa/50">
            {participants.length}/{table.capacity}
          </span>
        </div>
      </header>

      <div className="chill-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-1 pt-2.5">
        <div>
          <div className="flex items-center justify-between px-1 pb-1">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.24em] text-cocoa/50">
              camera
            </h3>
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="focus-ring flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-cocoa/45 transition hover:text-cocoa"
            >
              <Maximize2 className="h-2.5 w-2.5" /> mở rộng
            </button>
          </div>
          <VideoGrid
            participants={participants}
            selfId={selfId}
            cameraStream={cameraStream}
            speaking={speaking}
          />
        </div>

        <div className="shrink-0">
          <div className="flex items-center justify-between px-1 pb-1">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.24em] text-cocoa/50">
              thành viên
            </h3>
            <span className="font-mono text-[9px] text-cocoa/35">
              {participants.length} người
            </span>
          </div>
          <div className="chill-scroll max-h-[172px] overflow-y-auto rounded-xl border border-cocoa/10 bg-white/35 p-1">
            <ParticipantList
              participants={participants}
              isHost={isHost}
              selfId={selfId}
              onKick={onKick}
            />
          </div>
        </div>

        <div className="flex min-h-[170px] flex-1 flex-col">
          <TextChat
            messages={messages}
            selfId={selfId}
            typingName={typingName}
            onSend={onSendMessage}
          />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        <MicrophoneControls
          micOn={micOn}
          cameraOn={cameraOn}
          micLevel={micLevel}
          voiceEnabled={table.voiceEnabled}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onInvite={onInvite}
          onLeave={onLeave}
        />
      </div>

      <Modal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title="Camera trong bàn"
        description="Demo cục bộ — bật camera của bạn để thử khung hình."
        footer={
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cocoa/45">
            {participants.length} người · mic & camera luôn tắt mặc định
          </p>
        }
      >
        <VideoGrid
          participants={participants}
          selfId={selfId}
          cameraStream={cameraStream}
          speaking={speaking}
          layout="grid"
        />
      </Modal>
    </aside>
  );
}
