"use client";

import { ChevronDown, Settings2, UserPlus } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import type { SceneTheme } from "@/lib/types";
import type { UserProfile } from "@/lib/types";

interface TopBarProps {
  profile: UserProfile;
  scene: SceneTheme;
  onlineCount: number;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
}

export function TopBar({
  profile,
  scene,
  onlineCount,
  onOpenProfile,
  onOpenSettings,
  onOpenInvite,
}: TopBarProps) {
  return (
    <header className="flex h-[62px] shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Logo compact />
        <span className="hidden font-display text-[13px] font-extrabold tracking-[0.16em] text-ink sm:block">
          CHILLSPACE
        </span>
        <span className="hidden h-6 w-px bg-cocoa/15 sm:block" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#5FB86B]" />
            Sảnh Lounge
            <span className="hidden font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-cocoa/40 md:inline">
              · {onlineCount} online
            </span>
          </p>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-cocoa/45">
            {scene.label}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenInvite}
          className="focus-ring hidden items-center gap-1.5 rounded-xl border border-cocoa/15 bg-white/60 px-3 py-2 text-[12px] font-medium text-cocoa transition hover:border-cocoa/30 hover:bg-white sm:flex"
        >
          <UserPlus className="h-3.5 w-3.5" /> Mời bạn
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Mở cài đặt"
          className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-cocoa/15 bg-white/60 text-cocoa transition hover:border-cocoa/30 hover:bg-white"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="focus-ring group flex items-center gap-2 rounded-xl border border-cocoa/15 bg-white/60 py-1 pl-1 pr-2.5 transition hover:border-cocoa/30 hover:bg-white"
        >
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-cream">
            <AvatarSprite avatarId={profile.avatarId} size={22} animate={false} />
          </span>
          <span className="hidden max-w-[90px] truncate text-[12px] font-medium text-ink sm:block">
            {profile.nickname}
          </span>
          <ChevronDown className="hidden h-3 w-3 text-cocoa/40 sm:block" />
        </button>
      </div>
    </header>
  );
}
