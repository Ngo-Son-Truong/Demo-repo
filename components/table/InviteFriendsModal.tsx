"use client";

import { useState } from "react";
import { Check, Copy, Link2, Send, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { CafeTable } from "@/lib/types";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { cn } from "@/lib/utils";

const FRIENDS = [
  { id: "f-1", nickname: "Ngọc Anh", avatarId: "honey", status: "Đang trong quán · Bàn Piano" },
  { id: "f-2", nickname: "Trung", avatarId: "midnight", status: "Đang thư giãn ở sảnh" },
  { id: "f-3", nickname: "Mây", avatarId: "moss", status: "Online · rảnh rang" },
];

interface InviteFriendsModalProps {
  open: boolean;
  table: CafeTable | null;
  onClose: () => void;
  onInvite: (friendName: string) => void;
  onCopy: (label: string) => void;
}

export function InviteFriendsModal({
  open,
  table,
  onClose,
  onInvite,
  onCopy,
}: InviteFriendsModalProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const code = table?.inviteCode ?? "CHILLS";
  const link = `https://chillspace.app/join/${code}`;

  const copy = async (value: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard can be blocked — the toast still confirms intent */
    }
    setCopied(kind);
    onCopy(kind === "code" ? "Đã copy mã mời" : "Đã copy đường link");
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mời bạn vào bàn"
      description={table ? `Gửi mã mời để bạn bè tìm thấy “${table.name}”.` : "Chia sẻ mã để mời bạn bè."}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-cocoa/15 bg-white/60 p-4">
          <p className="text-center font-mono text-[9px] uppercase tracking-[0.3em] text-cocoa/45">
            mã mời
          </p>
          <p className="mt-1 text-center font-display text-3xl font-bold tracking-[0.3em] text-ink">
            {code}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => copy(code, "code")}
              className="focus-ring flex items-center justify-center gap-2 rounded-xl border border-cocoa/20 bg-white px-3 py-2 text-xs font-semibold text-cocoa transition hover:border-cocoa/35"
            >
              {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "code" ? "Đã copy" : "Copy mã"}
            </button>
            <button
              type="button"
              onClick={() => copy(link, "link")}
              className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-parchment transition hover:bg-cocoaDark"
            >
              {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied === "link" ? "Đã copy link" : "Copy đường link"}
            </button>
          </div>
          <p className="mt-2 truncate text-center font-mono text-[10px] text-cocoa/45">{link}</p>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/55">
            <Sparkles className="h-3.5 w-3.5" /> đang online
          </p>
          <div className="mt-2 space-y-1.5">
            {FRIENDS.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-cocoa/10 hover:bg-white/50"
              >
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-cream">
                  <AvatarSprite avatarId={friend.avatarId} size={28} animate={false} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{friend.nickname}</p>
                  <p className="truncate text-[10px] text-cocoa/55">{friend.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onInvite(friend.nickname)}
                  className={cn(
                    "focus-ring flex items-center gap-1 rounded-lg border border-teal/30 bg-teal/10 px-2.5 py-1.5 text-[11px] font-semibold text-tealDeep transition hover:bg-teal/20",
                  )}
                >
                  <Send className="h-3 w-3" /> Mời
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
