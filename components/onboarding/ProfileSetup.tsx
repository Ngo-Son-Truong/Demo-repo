"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { PixelScene } from "@/components/background/PixelScene";
import { Logo } from "@/components/ui/Logo";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { AVATARS, getAvatar } from "@/lib/data/avatars";
import type { SceneThemeId, UserProfile } from "@/lib/types";
import { cn, createId } from "@/lib/utils";

interface ProfileSetupProps {
  theme: SceneThemeId;
  initial?: UserProfile | null;
  inviteCode?: string | null;
  onBack: () => void;
  onSubmit: (profile: UserProfile) => void;
}

const STATUSES = [
  "Đang thư giãn ☕",
  "Sẵn sàng trò chuyện",
  "Chỉ nghe nhạc 🎧",
  "Đang làm việc nhẹ",
];

export function ProfileSetup({ theme, initial, inviteCode, onBack, onSubmit }: ProfileSetupProps) {
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [avatarId, setAvatarId] = useState(initial?.avatarId ?? "moss");
  const [status, setStatus] = useState(initial?.status ?? STATUSES[0]);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const avatar = getAvatar(avatarId);

  const submit = () => {
    const name = nickname.trim();
    if (name.length < 2) {
      setError("Nickname cần ít nhất 2 ký tự nhé.");
      return;
    }
    if (name.length > 20) {
      setError("Nickname hơi dài — tối đa 20 ký tự.");
      return;
    }
    setEntering(true);
    window.setTimeout(() => {
      onSubmit({
        id: initial?.id ?? createId("user"),
        nickname: name,
        avatarId,
        status,
      });
    }, 420);
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-night">
      <PixelScene theme={theme} nightMode className="absolute inset-0 h-full w-full" baseHeight={168} />
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(14,11,10,0.78),rgba(14,11,10,0.45)_45%,rgba(14,11,10,0.9))]" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between">
          <Logo light />
          <button
            type="button"
            onClick={onBack}
            className="focus-ring flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-xs text-parchment/70 backdrop-blur transition hover:text-parchment"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full animate-popIn overflow-hidden rounded-[28px] border border-white/15 bg-parchment/[0.97] shadow-panel backdrop-blur-xl">
            <div className="grid gap-0 md:grid-cols-[0.82fr_1.18fr]">
              {/* Preview */}
              <div className="relative hidden overflow-hidden bg-[#241C18] p-6 md:flex md:flex-col md:justify-between">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 22%, rgba(255,189,89,0.28), transparent 55%), linear-gradient(170deg,#2E231D 0%,#3C2C23 48%,#1B1410 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 opacity-[0.14]"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(245,235,221,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(245,235,221,0.35) 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#180F0B]/90 via-[#180F0B]/10 to-transparent" />
                <div className="relative">
                  <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-parchment/55">
                    xem trước · nhân vật của bạn
                  </p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-parchment">
                    Một chỗ ngồi đang chờ
                  </h2>
                </div>

                <div className="relative flex flex-col items-center pb-2">
                  <div className="absolute bottom-8 h-8 w-24 rounded-full bg-black/40 blur-md" />
                  <AvatarSprite avatarId={avatarId} size={104} state="wave" className="relative animate-floaty" />
                  <div className="relative mt-3 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-center backdrop-blur">
                    <p className="text-xs font-semibold text-parchment">
                      {nickname.trim() || "Khách dễ thương"}
                    </p>
                    <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-parchment/50">
                      {avatar.pronouns}
                    </p>
                  </div>
                </div>

                <div className="relative rounded-xl border border-white/10 bg-black/30 p-2.5 backdrop-blur">
                  <p className="text-[10px] leading-relaxed text-parchment/60">
                    “{status}” — trạng thái này hiện phía trên nhân vật để mọi người biết bạn đang
                    thế nào.
                  </p>
                </div>
              </div>

              {/* Form */}
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-cocoa/45">
                      hồ sơ · bước cuối
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
                      Bạn muốn được gọi là gì?
                    </h1>
                  </div>
                  <span className="hidden rounded-full border border-teal/25 bg-teal/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-tealDeep sm:block">
                    nhanh thôi
                  </span>
                </div>

                {inviteCode && (
                  <div className="mt-3 rounded-xl border border-honeyDeep/30 bg-honey/15 px-3 py-2 text-[11px] leading-relaxed text-[#8A5A16]">
                    Bạn được mời vào bàn riêng với mã <strong className="font-mono">{inviteCode}</strong>.
                    Hoàn tất hồ sơ để được đưa thẳng vào bàn.
                  </div>
                )}

                <div className="mt-5">
                  <label htmlFor="nickname" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa/55">
                    nickname
                  </label>
                  <input
                    id="nickname"
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submit();
                    }}
                    maxLength={20}
                    placeholder="vd: Linh, Khoa, Mây…"
                    className="focus-ring mt-1.5 w-full rounded-xl border border-cocoa/20 bg-white/80 px-3.5 py-3 text-sm text-ink placeholder:text-cocoa/30"
                  />
                  <div className="mt-1 flex justify-between">
                    <span className="text-[10px] text-[#B4543F]">{error ?? ""}</span>
                    <span className="font-mono text-[9px] text-cocoa/35">{nickname.length}/20</span>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa/55">
                      avatar pixel
                    </span>
                    <span className="text-[10px] text-cocoa/40">{avatar.name}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                    {AVATARS.map((option) => {
                      const active = option.id === avatarId;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setAvatarId(option.id)}
                          aria-pressed={active}
                          aria-label={`Chọn avatar ${option.name}`}
                          className={cn(
                            "focus-ring relative grid aspect-square place-items-center overflow-hidden rounded-xl border transition",
                            active
                              ? "border-teal bg-teal/10 shadow-[inset_0_0_0_1px_rgba(7,153,173,0.35)]"
                              : "border-cocoa/15 bg-white/60 hover:-translate-y-0.5 hover:border-cocoa/30",
                          )}
                        >
                          <span
                            className="absolute inset-x-0 bottom-0 h-1/2"
                            style={{ background: `${option.outfit}18` }}
                          />
                          <AvatarSprite avatarId={option.id} size={30} animate={active} />
                          {active && (
                            <span className="absolute right-0.5 top-0.5 grid h-3 w-3 place-items-center rounded-full bg-teal text-white">
                              <Check className="h-2 w-2" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa/55">
                    tâm trạng hôm nay
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STATUSES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStatus(option)}
                        aria-pressed={status === option}
                        className={cn(
                          "focus-ring rounded-full border px-2.5 py-1 text-[11px] transition",
                          status === option
                            ? "border-honeyDeep/50 bg-honey/25 text-[#7A4E12]"
                            : "border-cocoa/15 bg-white/60 text-cocoa/65 hover:border-cocoa/30",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submit}
                  disabled={entering}
                  className="focus-ring group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3.5 text-sm font-semibold text-parchment shadow-[0_16px_30px_-18px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:bg-cocoaDark disabled:translate-y-0 disabled:opacity-80"
                >
                  {entering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Đang mở cửa quán…
                    </>
                  ) : (
                    <>
                      Bước vào quán
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
                <p className="mt-2.5 text-center text-[10px] leading-relaxed text-cocoa/45">
                  Micro và camera luôn tắt khi bạn vào bàn. Không có gì được ghi lại.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
