"use client";

import { Moon, ShieldCheck, Sun, Volume2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SCENES } from "@/lib/data/scenes";
import type { AmbientAudioController } from "@/lib/hooks/useAmbientAudio";
import type { SceneThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  audio: AmbientAudioController;
  theme: SceneThemeId;
  onThemeChange: (theme: SceneThemeId) => void;
  nightMode: boolean;
  onToggleNight: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  audio,
  theme,
  onThemeChange,
  nightMode,
  onToggleNight,
}: SettingsPanelProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cài đặt không gian"
      description="Mọi thứ ở đây chỉ ảnh hưởng đến trải nghiệm của bạn."
    >
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa/55">
            không gian
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {SCENES.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => onThemeChange(scene.id)}
                className={cn(
                  "focus-ring flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition",
                  theme === scene.id
                    ? "border-teal/45 bg-teal/10"
                    : "border-cocoa/10 bg-white/50 hover:border-cocoa/25",
                )}
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-lg border border-black/10"
                  style={{ background: scene.swatch }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-ink">{scene.label}</span>
                  <span className="block truncate text-[9px] text-cocoa/50">{scene.mood}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onToggleNight}
            className="focus-ring flex items-center justify-between rounded-xl border border-cocoa/10 bg-white/50 px-3 py-2.5 text-left transition hover:border-cocoa/25"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-cocoa">
              {nightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Hiệu ứng ánh sáng
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cocoa/50">
              {nightMode ? "ban đêm" : "ban ngày"}
            </span>
          </button>

          <div className="rounded-xl border border-cocoa/10 bg-white/50 px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs font-medium text-cocoa">
              <Volume2 className="h-4 w-4" /> Âm lượng nhạc nền
            </span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(audio.volume * 100)}
                onChange={(event) => audio.setVolume(Number(event.target.value) / 100)}
                aria-label="Âm lượng"
                className="chill-range h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-cocoa/15 accent-honey"
              />
              <span className="font-mono text-[9px] text-cocoa/50">
                {Math.round(audio.volume * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-teal/25 bg-teal/[0.08] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-tealDeep">
            <ShieldCheck className="h-3.5 w-3.5" /> Quyền riêng tư
          </p>
          <ul className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-cocoa/65">
            <li>• Micro và camera luôn bật ở trạng thái tắt khi vào bàn.</li>
            <li>• Voice chỉ hoạt động trong bàn của bạn — không truyền sang bàn khác.</li>
            <li>• Nhạc nền và âm thanh môi trường tách biệt hoàn toàn khỏi voice chat.</li>
          </ul>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-cocoa/35">
          chillspace prototype · v0.1 · dữ liệu mẫu
        </p>
      </div>
    </Modal>
  );
}
