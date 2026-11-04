import type { AvatarLook } from "@/lib/types";

export type CharacterState = "idle" | "walk" | "sit" | "wave" | "talk";

export interface CharacterDrawOptions {
  state: CharacterState;
  time: number;
  facing?: 1 | -1;
  speaking?: boolean;
  scale?: number;
  dimmed?: boolean;
}

/**
 * A chunky little 10x24 pixel person. Everything is drawn from generated pixels,
 * so no sprite sheets to download and expressions can change on the fly.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: AvatarLook,
  options: CharacterDrawOptions,
) {
  const { state, time, facing = 1, speaking = false, scale = 1, dimmed = false } = options;
  const u = Math.max(1, Math.round(1 * scale * 10) / 10);
  const sitting = state === "sit";
  const walking = state === "walk";
  const waving = state === "wave";

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (dimmed) ctx.globalAlpha = 0.65;

  // Contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, sitting ? 2 * u : 0, 6 * u, 2 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = sitting ? 0 : walking ? Math.abs(Math.sin(time * 11)) * 0.8 * u : Math.sin(time * 2.2) * 0.35 * u;
  const baseY = -bob;

  // Legs
  const legPhase = walking ? Math.sin(time * 11) : 0;
  ctx.fillStyle = look.accent;
  if (sitting) {
    ctx.fillRect(-4 * u, baseY - 5 * u, 3 * u, 5 * u);
    ctx.fillRect(1 * u, baseY - 5 * u, 3 * u, 5 * u);
    ctx.fillStyle = "#2C2118";
    ctx.fillRect(-4.5 * u, baseY - 1.5 * u, 4 * u, 1.8 * u);
    ctx.fillRect(0.5 * u, baseY - 1.5 * u, 4 * u, 1.8 * u);
  } else {
    ctx.fillRect(-3.4 * u, baseY - 6 * u + legPhase * 1.2 * u, 2.6 * u, 6 * u);
    ctx.fillRect(0.8 * u, baseY - 6 * u - legPhase * 1.2 * u, 2.6 * u, 6 * u);
    ctx.fillStyle = "#2C2118";
    ctx.fillRect(-3.7 * u, baseY - 0.8 * u + legPhase * 1.2 * u, 3.1 * u, 1.6 * u);
    ctx.fillRect(0.6 * u, baseY - 0.8 * u - legPhase * 1.2 * u, 3.1 * u, 1.6 * u);
  }

  // Torso
  if (sitting) {
    ctx.fillStyle = look.outfit;
    ctx.fillRect(-4.2 * u, baseY - 13 * u, 8.4 * u, 8.6 * u);
    ctx.fillStyle = shade(look.outfit, -18);
    ctx.fillRect(-4.2 * u, baseY - 5.4 * u, 8.4 * u, 1.4 * u);
  } else {
    ctx.fillStyle = look.outfit;
    ctx.fillRect(-4.2 * u, baseY - 14.4 * u, 8.4 * u, 9.6 * u);
    // soft shading on the right side of the body
    ctx.fillStyle = shade(look.outfit, -16);
    ctx.fillRect(1.2 * u, baseY - 14.4 * u, 3 * u, 9.6 * u);
  }

  // Arms
  ctx.fillStyle = look.skin;
  if (waving) {
    ctx.fillRect(3.6 * u, baseY - 17.5 * u, 2.2 * u, 5.4 * u);
    // open hand
    ctx.fillRect(5.2 * u, baseY - 18.6 * u, 2 * u, 2 * u);
    ctx.fillRect(3.6 * u, baseY - 13.4 * u, 2.2 * u, 4.6 * u);
  } else if (sitting) {
    ctx.fillRect(-5.6 * u, baseY - 11 * u, 2 * u, 5 * u);
    ctx.fillRect(3.6 * u, baseY - 11 * u, 2 * u, 5 * u);
  } else {
    const swing = walking ? Math.sin(time * 11) * 1.4 * u : 0;
    ctx.fillRect(-5.6 * u, baseY - 13.6 * u - swing * 0.3, 2 * u, 6 * u);
    ctx.fillRect(3.6 * u, baseY - 13.6 * u + swing * 0.3, 2 * u, 6 * u);
  }

  // Head
  const headY = sitting ? baseY - 20.4 * u : baseY - 21.6 * u;
  ctx.fillStyle = look.skin;
  ctx.fillRect(-4 * u, headY, 8 * u, 7.6 * u);
  // ears
  ctx.fillRect(-4.8 * u, headY + 3 * u, 1 * u, 2 * u);
  ctx.fillRect(3.8 * u, headY + 3 * u, 1 * u, 2 * u);
  // neck
  ctx.fillStyle = shade(look.skin, -14);
  ctx.fillRect(-1.5 * u, headY + 7 * u, 3 * u, 1.4 * u);

  // Hair
  drawHair(ctx, look, headY, u);

  // Face (facing direction shifts the eyes)
  const eyeShift = facing === 1 ? 0.4 * u : -1.2 * u;
  ctx.fillStyle = "#2B2018";
  ctx.fillRect(-1.9 * u + eyeShift, headY + 4.1 * u, 1.3 * u, 1.4 * u);
  ctx.fillRect(1.1 * u + eyeShift, headY + 4.1 * u, 1.3 * u, 1.4 * u);
  // cheek blush
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#E2826F";
  ctx.fillRect(-3 * u + eyeShift, headY + 5.6 * u, 1.6 * u, 0.9 * u);
  ctx.fillRect(1.7 * u + eyeShift, headY + 5.6 * u, 1.6 * u, 0.9 * u);
  ctx.globalAlpha = dimmed ? 0.55 : 0.85;

  // mouth
  ctx.fillStyle = "#8E5A46";
  if (speaking && Math.floor(time * 6) % 2 === 0) {
    ctx.fillRect(-1 * u + eyeShift, headY + 6.2 * u, 2 * u, 1.2 * u);
  } else {
    ctx.fillRect(-0.6 * u + eyeShift, headY + 6.2 * u, 1.4 * u, 0.7 * u);
  }
  ctx.globalAlpha = dimmed ? 0.65 : 1;

  ctx.restore();
}

function drawHair(ctx: CanvasRenderingContext2D, look: AvatarLook, headY: number, u: number) {
  ctx.fillStyle = look.hair;
  switch (look.hairStyle) {
    case "bob":
      ctx.fillRect(-4.6 * u, headY - 2 * u, 9.2 * u, 3.6 * u);
      ctx.fillRect(-4.6 * u, headY + 1.4 * u, 1.6 * u, 5 * u);
      ctx.fillRect(3 * u, headY + 1.4 * u, 1.6 * u, 5 * u);
      ctx.fillRect(-2.8 * u, headY - 0.6 * u, 5.6 * u, 1.2 * u);
      break;
    case "short":
      ctx.fillRect(-4.2 * u, headY - 1.8 * u, 8.4 * u, 3 * u);
      ctx.fillRect(-4.2 * u, headY - 0.4 * u, 1.4 * u, 2 * u);
      ctx.fillRect(2.8 * u, headY - 1.2 * u, 1.4 * u, 2.2 * u);
      break;
    case "bun":
      ctx.fillRect(-4.2 * u, headY - 1.6 * u, 8.4 * u, 3 * u);
      ctx.beginPath();
      ctx.arc(0, headY - 3.2 * u, 2.4 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-4.4* u, headY + 0.4 * u, 1.2 * u, 3.4 * u);
      ctx.fillRect(3.2 * u, headY + 0.4 * u, 1.2 * u, 3.4 * u);
      break;
    case "long":
      ctx.fillRect(-4.6 * u, headY - 1.8 * u, 9.2 * u, 3.4 * u);
      ctx.fillRect(-4.8 * u, headY + 0.8 * u, 1.8 * u, 9 * u);
      ctx.fillRect(3 * u, headY + 0.8 * u, 1.8 * u, 9 * u);
      break;
    case "curly":
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc((-3.2 + i * 1.6) * u, headY - 0.8 * u, 1.5 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(-4.4 * u, headY, 1.2 * u, 3.6 * u);
      ctx.fillRect(3.2 * u, headY, 1.2 * u, 3.6 * u);
      break;
    case "cap":
      ctx.fillStyle = look.outfit;
      ctx.fillRect(-4.6 * u, headY - 2.2 * u, 9.2 * u, 3.2 * u);
      ctx.fillRect(-5.6 * u, headY + 0.2 * u, 11.2 * u, 1.2 * u);
      ctx.fillStyle = look.accent;
      ctx.fillRect(-1.2 * u, headY - 2.2 * u, 2.4 * u, 1.4 * u);
      break;
    default:
      break;
  }
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  options: {
    speaking?: boolean;
    self?: boolean;
    isHost?: boolean;
    muted?: boolean;
    fontScale?: number;
  } = {},
) {
  const { speaking = false, self = false, isHost = false, muted = false, fontScale = 1 } = options;
  const fontSize = Math.max(6, Math.round(6 * fontScale));
  ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
  const label = `${isHost ? "♛ " : ""}${name}${muted ? "  ·" : ""}`;
  const width = ctx.measureText(label).width + 8;
  const height = fontSize + 5;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);

  ctx.fillStyle = speaking ? "rgba(255, 189, 89, 0.96)" : self ? "rgba(7, 153, 173, 0.94)" : "rgba(20, 16, 14, 0.72)";
  roundRect(ctx, left, top, width, height, 3);
  ctx.fill();
  if (speaking) {
    ctx.strokeStyle = "rgba(37,37,37,0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, left + 0.5, top + 0.5, width - 1, height - 1, 3);
    ctx.stroke();
  }

  ctx.fillStyle = speaking ? "#252525" : "#F5EBDD";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, top + height / 2 + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontScale = 1,
) {
  const fontSize = Math.max(6, Math.round(6.5 * fontScale));
  ctx.font = `${fontSize}px ui-rounded, "Segoe UI", system-ui, sans-serif`;
  const maxWidth = 110 * fontScale;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  const limited = lines.slice(0, 3);
  const lineHeight = fontSize + 2;
  const width = Math.min(
    maxWidth + 12,
    Math.max(...limited.map((line) => ctx.measureText(line).width)) + 12,
  );
  const height = limited.length * lineHeight + 8;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height);

  ctx.globalAlpha = 0.97;
  ctx.fillStyle = "#FBF5EA";
  roundRect(ctx, left, top, width, height, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(37,37,37,0.55)";
  ctx.lineWidth = 1;
  roundRect(ctx, left + 0.5, top + 0.5, width - 1, height - 1, 4);
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(x - 3, top + height);
  ctx.lineTo(x + 1, top + height + 4);
  ctx.lineTo(x + 3, top + height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#252525";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  limited.forEach((line, index) => {
    ctx.fillText(line, left + 6, top + 4 + index * lineHeight);
  });
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 1;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const num = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16,
  );
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}
