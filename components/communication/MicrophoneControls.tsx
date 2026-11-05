"use client";

import { LogOut, Mic, MicOff, PhoneOff, UserPlus, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface MicrophoneControlsProps {
  micOn: boolean;
  cameraOn: boolean;
  micLevel: number;
  voiceEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onInvite: () => void;
  onLeave: () => void;
}

export function MicrophoneControls({
  micOn,
  cameraOn,
  micLevel,
  voiceEnabled,
  onToggleMic,
  onToggleCamera,
  onInvite,
  onLeave,
}: MicrophoneControlsProps) {
  return (
    <div className="border-t border-cocoa/10 pt-2.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMic}
          aria-pressed={micOn}
          aria-label={micOn ? "Tắt micro" : "Bật micro"}
          className={cn(
            "focus-ring group relative grid h-9 flex-1 place-items-center overflow-hidden rounded-xl border transition",
            micOn
              ? "border-teal/40 bg-teal text-white hover:bg-tealDeep"
              : "border-cocoa/15 bg-white/70 text-cocoa hover:border-cocoa/30 hover:bg-white",
          )}
        >
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          <span
            className="absolute inset-x-1 bottom-1 h-[2px] rounded-full bg-white/60 transition-all duration-100"
            style={{ opacity: micOn ? 0.9 : 0, transform: `scaleX(${Math.min(1, micLevel * 3.2)})` }}
          />
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          aria-pressed={cameraOn}
          aria-label={cameraOn ? "Tắt camera" : "Bật camera"}
          className={cn(
            "focus-ring grid h-9 flex-1 place-items-center rounded-xl border transition",
            cameraOn
              ? "border-teal/40 bg-teal text-white hover:bg-tealDeep"
              : "border-cocoa/15 bg-white/70 text-cocoa hover:border-cocoa/30 hover:bg-white",
          )}
        >
          {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onInvite}
          aria-label="Mời bạn vào bàn"
          className="focus-ring grid h-9 flex-1 place-items-center rounded-xl border border-cocoa/15 bg-white/70 text-cocoa transition hover:border-cocoa/30 hover:bg-white"
        >
          <UserPlus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onLeave}
          aria-label="Rời bàn"
          className="focus-ring flex h-9 flex-[1.4] items-center justify-center gap-1.5 rounded-xl border border-[#B4543F]/25 bg-[#B4543F]/10 text-[11px] font-semibold text-[#9C4432] transition hover:bg-[#B4543F]/20"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          Rời bàn
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
        <p className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-cocoa/40">
          <span className={cn("h-1.5 w-1.5 rounded-full", voiceEnabled ? "bg-teal" : "bg-cocoa/25")} />
          {voiceEnabled ? "voice · demo cục bộ" : "chat only"}
        </p>
        <p className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-cocoa/35">
          <LogOut className="h-2.5 w-2.5" />
          nhạc nền vẫn chạy
        </p>
      </div>
    </div>
  );
}
