"use client";

import { ArrowRight, Headphones, Moon, Sparkles, Ticket } from "lucide-react";
import { PixelScene } from "@/components/background/PixelScene";
import { AmbientMusicPlayer } from "@/components/background/AmbientMusicPlayer";
import { Logo } from "@/components/ui/Logo";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import type { AmbientAudioController } from "@/lib/hooks/useAmbientAudio";
import type { SceneThemeId, UserProfile } from "@/lib/types";
import { getAvatar } from "@/lib/data/avatars";

interface LandingPageProps {
  theme: SceneThemeId;
  profile: UserProfile | null;
  audio: AmbientAudioController;
  inviteCode?: string | null;
  onEnter: () => void;
  onEditProfile: () => void;
}

const CROWD = [
  { avatarId: "moss", name: "Linh" },
  { avatarId: "matcha", name: "Khoa" },
  { avatarId: "honey", name: "Hà" },
  { avatarId: "plum", name: "Mai" },
];

export function LandingPage({
  theme,
  profile,
  audio,
  inviteCode,
  onEnter,
  onEditProfile,
}: LandingPageProps) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-night text-parchment">
      <PixelScene
        theme={theme}
        nightMode
        className="absolute inset-0 h-full w-full brightness-[1.3] saturate-[1.12]"
        baseHeight={168}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(14,11,10,0.55)_0%,rgba(14,11,10,0.04)_32%,rgba(14,11,10,0.3)_72%,rgba(14,11,10,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(10,8,7,0.4)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[1180px] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(12,9,8,0.5)_0%,rgba(12,9,8,0.32)_38%,rgba(12,9,8,0.12)_66%,transparent_88%)] blur-[2px]" />

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-9">
          <Logo light />
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-parchment/60 backdrop-blur sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7BD389]" />
              12 người trong quán
            </span>
            <button
              type="button"
              onClick={onEnter}
              className="focus-ring rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-parchment/85 backdrop-blur transition hover:border-white/35 hover:bg-white/15"
            >
              {profile ? "Vào lại quán" : "Đăng nhập nhanh"}
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center sm:px-9">
          <div className="animate-fadeUp -translate-y-10 sm:-translate-y-14">
            <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-honey/30 bg-honey/10 px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.26em] text-honey/90 backdrop-blur">
              <Sparkles className="h-3 w-3" />
              không gian ảo · mở 24/7
            </p>

            <h1 className="mt-6 font-display text-[clamp(2.6rem,8.5vw,5.6rem)] font-extrabold leading-[0.92] tracking-[0.16em] text-parchment drop-shadow-[0_12px_30px_rgba(0,0,0,0.55)]">
              CHILL<span className="text-honey">SPACE</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-balance text-[13.5px] leading-relaxed text-parchment/85 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-[15px]">
              Đừng chỉ tham gia một phòng chat. Hãy bước vào một không gian, chọn một chiếc bàn
              và ở lại lâu hơn một chút cùng những người bạn yêu quý.
            </p>

            {inviteCode && (
              <div className="mx-auto mt-6 flex w-fit max-w-full items-center gap-2.5 rounded-2xl border border-teal/40 bg-teal/[0.14] px-4 py-2 text-left backdrop-blur">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal/25 text-[#C9F2F7]">
                  <Ticket className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[8.5px] uppercase tracking-[0.2em] text-[#9FDDE7]/80">
                    bạn được mời
                  </span>
                  <span className="block truncate text-[12px] font-semibold text-parchment">
                    Ghế đang chờ bạn ở bàn{" "}
                    <span className="font-mono tracking-[0.1em] text-[#B8EDF4]">#{inviteCode}</span>
                  </span>
                </span>
              </div>
            )}

            <div
              className={`flex flex-col items-center justify-center gap-3 sm:flex-row ${
                inviteCode ? "mt-5" : "mt-8"
              }`}
            >
              <button
                type="button"
                onClick={onEnter}
                className="focus-ring group flex w-full items-center justify-center gap-2 rounded-2xl bg-honey px-7 py-4 text-sm font-bold text-ink shadow-[0_18px_40px_-18px_rgba(255,189,89,0.9)] transition hover:-translate-y-0.5 hover:bg-[#FFCB77] active:translate-y-0 sm:w-auto"
              >
                Bước vào không gian
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={audio.toggle}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 py-4 text-sm font-semibold text-parchment/85 backdrop-blur transition hover:border-white/35 hover:bg-white/10 sm:w-auto"
              >
                <Headphones className="h-4 w-4" />
                {audio.playing ? "Đang nghe nhạc nền" : "Nghe thử nhạc nền"}
              </button>
            </div>


            {profile && (
              <button
                type="button"
                onClick={onEditProfile}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[11px] text-parchment/70 backdrop-blur transition hover:text-parchment"
              >
                <span className="grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-white/10">
                  <AvatarSprite avatarId={profile.avatarId} size={14} animate={false} />
                </span>
                Tiếp tục với {profile.nickname}
                <span className="text-parchment/40">· đổi hồ sơ</span>
              </button>
            )}

            <div className="mt-9 flex flex-col items-center gap-2">
              <div className="flex -space-x-2">
                {CROWD.map((person) => (
                  <span
                    key={person.avatarId}
                    className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 border-[#241C18] bg-[#3A2B22]"
                    title={person.name}
                  >
                    <AvatarSprite avatarId={person.avatarId} size={24} animate={false} />
                  </span>
                ))}
                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#241C18] bg-white/10 font-mono text-[9px] text-parchment/70">
                  +9
                </span>
              </div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-parchment/55">
                <Moon className="h-3 w-3" /> đang có 13 người thư giãn cùng bạn
              </p>
            </div>
          </div>
        </main>

        <footer className="px-3 pb-3 sm:px-9 sm:pb-5">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
            <AmbientMusicPlayer audio={audio} compact />
            <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:text-left">
              <p className="text-[9px] leading-relaxed text-parchment/35">
                Nhạc nền phát độc lập, kể cả khi bạn rời bàn.
              </p>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-parchment/30">
                <span className="hidden sm:inline">prototype giao diện · dữ liệu mẫu</span>
                <span className="sm:hidden">prototype · dữ liệu mẫu</span>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
