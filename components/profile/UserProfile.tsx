"use client";

import { Clock3, Coffee, LogOut, Pencil, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { getAvatar } from "@/lib/data/avatars";
import type { UserProfile as UserProfileType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UserProfileProps {
  open: boolean;
  profile: UserProfileType;
  tablesVisited: number;
  onClose: () => void;
  onEdit: () => void;
  onSignOut: () => void;
}

export function UserProfile({
  open,
  profile,
  tablesVisited,
  onClose,
  onEdit,
  onSignOut,
}: UserProfileProps) {
  const avatar = getAvatar(profile.avatarId);

  return (
    <Modal open={open} onClose={onClose} width="sm" title="Hồ sơ của bạn">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-cocoa/15 bg-gradient-to-br from-[#F3E7D6] to-[#EAD8BF] p-4">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl"
            style={{ background: `${avatar.outfit}55` }}
          />
          <div className="relative flex items-center gap-3.5">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/70 bg-white/50">
              <AvatarSprite avatarId={profile.avatarId} size={54} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-ink">{profile.nickname}</p>
              <p className="mt-0.5 text-[11px] text-cocoa/60">{profile.status}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-cocoa/15 bg-white/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cocoa/60">
                <Coffee className="h-2.5 w-2.5" /> {avatar.name} · {avatar.pronouns}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Users, label: "bàn đã ghé", value: tablesVisited },
            { icon: Clock3, label: "giờ thư giãn", value: "2.5" },
            { icon: Coffee, label: "ly cà phê", value: "7" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-xl border border-cocoa/10 bg-white/55 px-2.5 py-2 text-center"
              >
                <Icon className="mx-auto h-3.5 w-3.5 text-cocoa/45" />
                <p className="mt-1 font-display text-base font-semibold text-ink">{stat.value}</p>
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-cocoa/45">
                  {stat.label}
                </p>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="focus-ring flex w-full items-center justify-between rounded-xl border border-cocoa/15 bg-white/60 px-3 py-2.5 text-sm text-ink transition hover:border-cocoa/30"
          >
            <span className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-cocoa/60" /> Đổi nickname & avatar
            </span>
            <span className="text-[10px] text-cocoa/40">mở hồ sơ</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className={cn(
              "focus-ring flex w-full items-center justify-between rounded-xl border border-[#B4543F]/20 bg-[#B4543F]/[0.08] px-3 py-2.5 text-sm text-[#9C4432] transition hover:bg-[#B4543F]/15",
            )}
          >
            <span className="flex items-center gap-2">
              <LogOut className="h-3.5 w-3.5" /> Rời khỏi quán
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
