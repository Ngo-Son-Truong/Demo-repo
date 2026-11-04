"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SceneThemeId } from "@/lib/types";
import { createSceneState, drawScene, type SceneState } from "@/lib/background/renderScene";

interface PixelSceneProps {
  theme: SceneThemeId;
  nightMode?: boolean;
  className?: string;
  /** Logical pixel height used by the canvas fallback. Lower = chunkier pixels. */
  baseHeight?: number;
  paused?: boolean;
}

type Variant = "wide" | "std" | "tall";

const VARIANT_SUFFIX: Record<Variant, string> = {
  wide: "-wide",
  std: "",
  tall: "-tall",
};

/**
 * Ambient motion layers per scene. The artwork itself is a baked image now, so
 * the living parts (rain, haze, twinkling stars) are cheap CSS overlays.
 */
const SCENE_MOTION: Record<SceneThemeId, { rain?: "light" | "heavy"; haze?: boolean; twinkle?: boolean }> = {
  rainyCafe: { rain: "heavy", haze: true },
  cozyRoom: { twinkle: true, haze: true },
  sunset: { twinkle: true, haze: true },
  ocean: { haze: true },
  starry: { twinkle: true, haze: true },
  forest: { rain: "light", haze: true },
  japaneseCafe: { haze: true },
  cityNight: { rain: "light", haze: true },
};

/**
 * Full-bleed pixel landscape.
 *
 * The scenery ships as pre-rendered WebP artwork (see `npm run assets`) so the
 * details stay sharp at any size instead of being upscaled from a tiny canvas.
 * A canvas renderer is kept as an instant fallback while the image loads or if
 * the asset is missing.
 */
export function PixelScene({
  theme,
  nightMode = true,
  className = "",
  baseHeight = 150,
  paused = false,
}: PixelSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<SceneState>(createSceneState(theme));
  const sizeRef = useRef({ w: 320, h: baseHeight });
  const nightRef = useRef(nightMode);
  const pausedRef = useRef(paused);
  const readyRef = useRef(false);

  const [variant, setVariant] = useState<Variant>("std");
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  nightRef.current = nightMode;
  pausedRef.current = paused;
  readyRef.current = imageReady && !imageFailed;

  useEffect(() => {
    stateRef.current = createSceneState(theme);
  }, [theme]);

  // Pick the artwork variant that best matches the container shape.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const aspect = rect.width / rect.height;
      const next: Variant = aspect >= 2.05 ? "wide" : aspect <= 1.05 ? "tall" : "std";
      setVariant((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setImageReady(false);
    setImageFailed(false);
  }, [theme, variant]);

  // Canvas fallback: draws the same scene procedurally until the artwork lands.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let last = performance.now();
    let running = true;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const aspect = Math.max(1.1, rect.width / Math.max(1, rect.height));
      const h = baseHeight;
      const w = Math.max(120, Math.round(h * aspect));
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
      ctx.imageSmoothingEnabled = false;
      drawScene(ctx, stateRef.current, w, h, 0, nightRef.current);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !readyRef.current) {
        const { w, h } = sizeRef.current;
        drawScene(ctx, stateRef.current, w, h, dt, nightRef.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [baseHeight]);

  const hasPositionClass = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/.test(className);
  const motion = SCENE_MOTION[theme] ?? {};
  const showImage = !imageFailed;

  return (
    <div
      ref={wrapRef}
      className={cn("overflow-hidden", !hasPositionClass && "relative", className)}
    >
      <canvas
        ref={canvasRef}
        className={cn("pixelated h-full w-full", imageReady && !imageFailed && "opacity-0")}
        aria-hidden
      />
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${theme}-${variant}`}
          src={`/assets/scenes/${theme}${VARIANT_SUFFIX[variant]}.webp`}
          alt=""
          aria-hidden
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500",
            imageReady ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      <SceneMotion {...motion} />

      {!nightMode && imageReady && !imageFailed && (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(255,226,178,0.35)] mix-blend-soft-light" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_38%,rgba(18,14,12,0.5)_100%)]" />
    </div>
  );
}

function SceneMotion({
  rain,
  haze,
  twinkle,
}: {
  rain?: "light" | "heavy";
  haze?: boolean;
  twinkle?: boolean;
}) {
  if (!rain && !haze && !twinkle) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {haze && <div className="scene-haze absolute inset-0" />}
      {twinkle && <div className="scene-stars absolute inset-0" />}
      {rain && (
        <>
          <div
            className={cn(
              "scene-rain absolute -inset-x-[12%] -inset-y-[15%]",
              rain === "heavy" ? "opacity-[0.32]" : "opacity-20",
            )}
          />
          <div className="scene-rain scene-rain-slow absolute -inset-x-[12%] -inset-y-[15%] opacity-20" />
        </>
      )}
    </div>
  );
}
