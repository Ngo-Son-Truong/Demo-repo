"use client";

import { useEffect, useRef } from "react";
import { Crown, Mic, MicOff } from "lucide-react";
import type { Participant } from "@/lib/types";
import { getAvatar } from "@/lib/data/avatars";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { cn } from "@/lib/utils";

interface VideoGridProps {
  participants: Participant[];
  selfId: string;
  cameraStream: MediaStream | null;
  speaking: boolean;
  layout?: "strip" | "grid";
}

export function VideoGrid({
  participants,
  selfId,
  cameraStream,
  speaking,
  layout = "strip",
}: VideoGridProps) {
  const strip = layout === "strip";

  return (
    <div
      className={cn(
        strip
          ? "chill-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          : "grid grid-cols-2 gap-2.5",
      )}
    >
      {participants.map((participant) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          isSelf={participant.id === selfId || Boolean(participant.isSelf)}
          cameraStream={
            Boolean(participant.isSelf) || participant.id === selfId ? cameraStream : null
          }
          speaking={participant.isSelf ? speaking : participant.speaking}
          strip={strip}
        />
      ))}
    </div>
  );
}

function VideoTile({
  participant,
  isSelf,
  cameraStream,
  speaking,
  strip,
}: {
  participant: Participant;
  isSelf: boolean;
  cameraStream: MediaStream | null;
  speaking: boolean;
  strip: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showVideo = participant.cameraOn && cameraStream;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (showVideo) {
      video.srcObject = cameraStream;
      void video.play().catch(() => undefined);
    }
    return () => {
      if (video) video.srcObject = null;
    };
  }, [cameraStream, showVideo]);

  const avatar = getAvatar(participant.avatarId);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-[#241C18] transition-all",
        strip ? "w-[86px] shrink-0" : "w-full",
        speaking
          ? "border-honey shadow-[0_0_0_2px_rgba(255,189,89,0.35),0_0_22px_rgba(255,189,89,0.22)]"
          : "border-cocoa/15",
      )}
    >
      <div className={cn("relative w-full", strip ? "aspect-square" : "aspect-[4/3]")}>
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full scale-x-[-1] object-cover"
          />
        ) : (
          <div className="relative grid h-full w-full place-items-center overflow-hidden">
            <span
              className="absolute inset-0 opacity-70"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${avatar.outfit}38, transparent 62%), linear-gradient(160deg,#2A201B,#1A1411)`,
              }}
            />
            <AvatarSprite
              avatarId={participant.avatarId}
              size={strip ? 42 : 58}
              animate
              className="relative drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
            />
          </div>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {speaking && (
          <span className="absolute left-1 top-1 flex items-center gap-1 rounded-[5px] bg-honey px-1 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-ink">
            <span className="flex h-2 items-end gap-[1.5px]">
              <span className="h-1 w-[2px] animate-[blink_0.9s_ease-in-out_infinite] rounded-full bg-ink" />
              <span className="h-2 w-[2px] animate-[blink_0.7s_ease-in-out_infinite] rounded-full bg-ink" />
              <span className="h-1.5 w-[2px] animate-[blink_1.1s_ease-in-out_infinite] rounded-full bg-ink" />
            </span>
            nói
          </span>
        )}

        {!speaking && (
          <span
            className={cn(
              "absolute right-1 top-1 rounded-[5px] p-0.5",
              participant.micOn ? "bg-teal/80 text-white" : "bg-black/40 text-parchment/45",
            )}
            title={participant.micOn ? "Micro đang bật" : "Micro đang tắt"}
          >
            {participant.micOn ? (
              <Mic className="h-2.5 w-2.5" />
            ) : (
              <MicOff className="h-2.5 w-2.5" />
            )}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-1">
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-parchment drop-shadow">
            {participant.nickname}
            {isSelf && <span className="ml-0.5 font-normal text-parchment/60">· bạn</span>}
          </p>
          {participant.isHost && <Crown className="h-2.5 w-2.5 shrink-0 text-honey" />}
        </div>

        {participant.connection && participant.connection !== "connected" && (
          <span className="absolute inset-x-1 bottom-7 rounded bg-black/65 px-1 py-0.5 text-center text-[7.5px] font-medium text-honey">
            {participant.connection === "connecting" ? "đang kết nối…" : "kết nối lại…"}
          </span>
        )}
      </div>
    </div>
  );
}
