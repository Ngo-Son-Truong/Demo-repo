"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { PixelScene } from "@/components/background/PixelScene";
import { AmbientMusicPlayer } from "@/components/background/AmbientMusicPlayer";
import { SCENES } from "@/lib/data/scenes";
import type { AmbientAudioController } from "@/lib/hooks/useAmbientAudio";
import type { SceneThemeId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BackgroundEnvironmentProps {
  theme: SceneThemeId;
  nightMode: boolean;
  onThemeChange: (theme: SceneThemeId) => void;
  onToggleNight: () => void;
  audio: AmbientAudioController;
}

export function BackgroundEnvironment({
  theme,
  nightMode,
  onThemeChange,
  onToggleNight,
  audio,
}: BackgroundEnvironmentProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const active = SCENES.find((scene) => scene.id === theme) ?? SCENES[0];

  return (
    <section
      className="relative min-h-[210px] flex-[7] overflow-hidden rounded-[22px] border border-cocoa/20 bg-night shadow-panel max-lg:flex-1 sm:min-h-[240px]"
      aria-label="Khu vực không gian thư giãn"
    >
      <PixelScene
        theme={theme}
        nightMode={nightMode}
        className="absolute inset-0 h-full w-full"
        baseHeight={150}
      />

      {/* Readability scrims */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#120F0D]/75 via-[#120F0D]/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120F0D]/80 via-[#120F0D]/25 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3.5 sm:p-4">
        <div className="animate-fadeUp">
          <button
            type="button"
            onClick={onToggleNight}
            className="focus-ring group flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-parchment/80 backdrop-blur transition hover:border-white/35 hover:text-parchment"
          >
            {nightMode ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            {nightMode ? "ban đêm" : "ban ngày"}
          </button>
          <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-parchment drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:text-xl">
            {active.label}
          </h2>
          <p className="mt-0.5 text-[11px] text-parchment/65">{active.mood}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setSwitcherOpen((open) => !open)}
            aria-expanded={switcherOpen}
            className={cn(
              "focus-ring flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[11px] font-medium text-parchment/85 backdrop-blur transition hover:border-white/35 hover:bg-black/35",
              switcherOpen && "border-honey/60 bg-black/40 text-honey",
            )}
          >
            <span className="flex gap-1" aria-hidden>
              {SCENES.slice(0, 4).map((scene) => (
                <span
                  key={scene.id}
                  className="h-2 w-2 rounded-[2px]"
                  style={{ background: scene.swatch }}
                />
              ))}
            </span>
            Đổi không gian
          </button>

          {switcherOpen && (
            <div className="w-[248px] animate-popIn rounded-2xl border border-white/15 bg-[#191411]/90 p-2 shadow-panel backdrop-blur-md sm:w-[264px]">
              <div className="grid grid-cols-2 gap-1">
                {SCENES.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => {
                      onThemeChange(scene.id);
                      setSwitcherOpen(false);
                    }}
                    className={cn(
                      "focus-ring group flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
                      scene.id === theme
                        ? "bg-honey/15 text-honey"
                        : "text-parchment/70 hover:bg-white/[0.08] hover:text-parchment",
                    )}
                  >
                    <span
                      className={cn(
                        "h-6 w-6 shrink-0 rounded-md border",
                        scene.id === theme ? "border-honey/70" : "border-white/15",
                      )}
                      style={{ background: scene.swatch }}
                    />
                    <span className="truncate text-[11px] font-medium">{scene.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="flex items-end gap-3">
          <div className="hidden shrink-0 flex-col gap-1 pb-1 text-[10px] uppercase tracking-[0.22em] text-parchment/45 lg:flex">
            <span>Không gian thư giãn</span>
            <span className="h-px w-16 bg-parchment/20" />
            <span>{nightMode ? "đêm" : "ngày"} · chillspace</span>
          </div>
          <div className="min-w-0 flex-1">
            <AmbientMusicPlayer audio={audio} />
          </div>
        </div>
      </div>
    </section>
  );
}
