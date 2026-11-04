"use client";

import { useEffect, useRef } from "react";
import { getAvatar } from "@/lib/data/avatars";
import { drawCharacter, type CharacterState } from "@/lib/world/character";
import { cn } from "@/lib/utils";

interface AvatarSpriteProps {
  avatarId: string;
  size?: number;
  state?: CharacterState;
  className?: string;
  animate?: boolean;
}

/** Standalone pixel avatar, used across onboarding, tiles and lists. */
export function AvatarSprite({
  avatarId,
  size = 64,
  state = "idle",
  className,
  animate = true,
}: AvatarSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const avatar = getAvatar(avatarId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = 34;
    const height = 44;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      drawCharacter(ctx, width / 2, height - 2, avatar, {
        state: stateRef.current,
        time: (now - start) / 1000,
        facing: 1,
        scale: 1.32,
      });
      if (animate) raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [avatar, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pixelated", className)}
      style={{ width: size, height: (size * 44) / 34 }}
      aria-label={`Avatar ${avatar.name}`}
      role="img"
    />
  );
}
