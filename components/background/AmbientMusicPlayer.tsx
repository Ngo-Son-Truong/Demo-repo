"use client";

import { Bird, CloudRain, Pause, Play, Volume1, Volume2, Waves, Wind } from "lucide-react";
import type { AmbientAudioController, AmbienceLayer } from "@/lib/hooks/useAmbientAudio";
import type { MusicMood } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOODS: Array<{ id: MusicMood; label: string }> = [
  { id: "lofi", label: "Lo-fi" },
  { id: "jazz", label: "Jazz" },
  { id: "piano", label: "Piano" },
  { id: "soft", label: "Nhẹ" },
];

const LAYERS: Array<{ id: AmbienceLayer; label: string; icon: typeof CloudRain }> = [
  { id: "rain", label: "Mưa", icon: CloudRain },
  { id: "waves", label: "Sóng", icon: Waves },
  { id: "birds", label: "Chim", icon: Bird },
  { id: "wind", label: "Gió", icon: Wind },
];

interface AmbientMusicPlayerProps {
  audio: AmbientAudioController;
  compact?: boolean;
}

export function AmbientMusicPlayer({ audio, compact = false }: AmbientMusicPlayerProps) {
  const { playing, volume, mood, layers, toggle, setVolume, setMood, toggleLayer } = audio;
  const VolumeIcon = volume === 0 ? Volume1 : Volume2;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-white/15 bg-[#1A1512]/70 px-3 py-2.5 text-parchment shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md",
        compact && "gap-x-2.5 px-2.5 py-2",
      )}
      data-typing-guard="true"
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Tạm dừng nhạc nền" : "Phát nhạc nền"}
        className="focus-ring group relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-honey text-ink shadow-[0_0_0_1px_rgba(0,0,0,0.15)] transition hover:scale-105 hover:bg-[#FFCB77] active:scale-95"
      >
        {playing ? (
          <Pause className="h-[18px] w-[18px]" strokeWidth={2.4} />
        ) : (
          <Play className="ml-0.5 h-[18px] w-[18px]" strokeWidth={2.4} />
        )}
      </button>

      <div className="flex min-w-[132px] items-center gap-2.5">
        <div className="flex h-7 items-end gap-[3px]" aria-hidden>
          {[0.35, 0.7, 1, 0.5, 0.8].map((height, index) => (
            <span
              key={index}
              className={cn(
                "w-[3px] rounded-full bg-honey/80 transition-all duration-300",
                playing ? "animate-[blink_1.4s_ease-in-out_infinite]" : "opacity-40",
              )}
              style={{
                height: `${height * 100}%`,
                animationDelay: `${index * 0.18}s`,
              }}
            />
          ))}
        </div>
        <div className="leading-tight">
          <p className="text-[12.5px] font-semibold tracking-tight">
            {MOODS.find((item) => item.id === mood)?.label} · Chillspace Radio
          </p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-parchment/55">
            Nhạc nền · độc lập với bàn
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5">
        {MOODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMood(item.id)}
            aria-pressed={mood === item.id}
            className={cn(
              "focus-ring rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              mood === item.id
                ? "bg-honey text-ink"
                : "text-parchment/65 hover:bg-white/10 hover:text-parchment",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {LAYERS.map((layer) => {
          const Icon = layer.icon;
          const active = layers[layer.id];
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => toggleLayer(layer.id)}
              aria-pressed={active}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition",
                compact && "px-1.5",
                active
                  ? "border-teal/70 bg-teal/25 text-[#CDEFF3]"
                  : "border-white/[0.12] text-parchment/55 hover:border-white/25 hover:text-parchment/85",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className={compact ? "hidden" : "hidden sm:inline"}>{layer.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <VolumeIcon className="h-4 w-4 text-parchment/60" />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          aria-label="Âm lượng nhạc nền"
          className="chill-range h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-honey sm:w-24"
        />
      </div>
    </div>
  );
}
