"use client";

import { Crown, Mic, MicOff, UserMinus } from "lucide-react";
import type { Participant } from "@/lib/types";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { cn } from "@/lib/utils";

interface ParticipantListProps {
  participants: Participant[];
  isHost: boolean;
  selfId: string;
  onKick: (participant: Participant) => void;
}

export function ParticipantList({ participants, isHost, selfId, onKick }: ParticipantListProps) {
  return (
    <div className="space-y-0.5">
      {participants.map((participant) => {
        const self = participant.isSelf || participant.id === selfId;
        return (
          <div
            key={participant.id}
            className="group flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-cocoa/5"
          >
            <span
              className={cn(
                "relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-cream",
                participant.speaking && "ring-2 ring-honey",
              )}
            >
              <AvatarSprite avatarId={participant.avatarId} size={18} animate={false} />
              {participant.speaking && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-parchment bg-honey" />
              )}
            </span>
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink">
              {participant.nickname}
              {self && <span className="ml-1 font-normal text-cocoa/45">(bạn)</span>}
            </p>
            {participant.isHost && <Crown className="h-3 w-3 text-honeyDeep" />}
            {participant.micOn ? (
              <Mic className={cn("h-3 w-3", participant.speaking ? "text-honeyDeep" : "text-teal")} />
            ) : (
              <MicOff className="h-3 w-3 text-cocoa/30" />
            )}
            {isHost && !self && (
              <button
                type="button"
                onClick={() => onKick(participant)}
                aria-label={`Mời ${participant.nickname} rời bàn`}
                className="focus-ring rounded p-0.5 text-cocoa/25 opacity-0 transition hover:bg-[#B4543F]/10 hover:text-[#B4543F] group-hover:opacity-100"
              >
                <UserMinus className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
