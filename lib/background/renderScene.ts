import type { SceneThemeId } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Tiny helpers                                                              */
/* -------------------------------------------------------------------------- */

export function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function px(value: number) {
  return Math.round(value);
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(px(x), px(y), Math.max(1, px(w)), Math.max(1, px(h)));
}

function gradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  return g;
}

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 0.5,
) {
  const g = ctx.createRadialGradient(px(x), px(y), 0, px(x), px(y), radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(px(x - radius), px(y - radius), radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

/** Stepped pixel cloud, used by the outdoor scenes. */
function pixelCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  light: string,
  shade: string,
) {
  const s = Math.max(2, Math.round(h));
  rect(ctx, x + w * 0.1, y + s, w * 0.5, s, light);
  rect(ctx, x + w * 0.26, y, w * 0.3, s, light);
  rect(ctx, x + w * 0.58, y + s * 0.6, w * 0.24, s * 1.4, light);
  rect(ctx, x, y + s * 2, w, s * 1.1, light);
  rect(ctx, x + w * 0.08, y + s * 3.05, w * 0.78, s * 0.7, shade);
}

function softEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
) {
  const g = ctx.createRadialGradient(px(x), px(y), 0, px(x), px(y), Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(px(x), px(y));
  ctx.scale(1, ry / Math.max(rx, ry));
  ctx.translate(-px(x), -px(y));
  ctx.fillStyle = g;
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPine(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  color: string,
) {
  rect(ctx, x - 1, baseY - height * 0.7, 2, height * 0.7, color);
  for (let i = 0; i < 3; i += 1) {
    const tierTop = baseY - height + i * height * 0.24;
    const tierBottom = baseY - height * 0.62 + i * height * 0.16;
    const halfWidth = height * (0.18 + i * 0.06);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, tierTop);
    ctx.lineTo(x - halfWidth, tierBottom);
    ctx.lineTo(x + halfWidth, tierBottom);
    ctx.closePath();
    ctx.fill();
  }
}

/* -------------------------------------------------------------------------- */
/*  Scene state                                                               */
/* -------------------------------------------------------------------------- */

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}
interface Star {
  x: number;
  y: number;
  phase: number;
  brightness: number;
}
interface Cloud {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
}

export interface SceneState {
  theme: SceneThemeId;
  time: number;
  rng: () => number;
  drops: Drop[];
  stars: Star[];
  clouds: Cloud[];
  fireflies: Star[];
  shooting?: { x: number; y: number; t: number } | null;
  flashes: number;
  flashTimer: number;
}

export function createSceneState(theme: SceneThemeId): SceneState {
  const rng = createRng(
    theme.split("").reduce((acc, char) => acc + char.charCodeAt(0), 7),
  );
  const drops: Drop[] = Array.from({ length: theme === "forest" ? 46 : 90 }, () => ({
    x: rng(),
    y: rng(),
    speed: 0.25 + rng() * 0.55,
    len: 0.015 + rng() * 0.05,
  }));
  const stars: Star[] = Array.from({ length: 90 }, () => ({
    x: rng(),
    y: rng() * 0.62,
    phase: rng() * Math.PI * 2,
    brightness: 0.35 + rng() * 0.65,
  }));
  const clouds: Cloud[] = Array.from({ length: 6 }, () => ({
    x: rng(),
    y: 0.08 + rng() * 0.3,
    w: 0.14 + rng() * 0.24,
    h: 4 + rng() * 7,
    speed: 0.004 + rng() * 0.012,
  }));
  const fireflies: Star[] = Array.from({ length: 22 }, () => ({
    x: rng(),
    y: 0.45 + rng() * 0.5,
    phase: rng() * Math.PI * 2,
    brightness: 0.4 + rng() * 0.6,
  }));
  return {
    theme,
    time: 0,
    rng,
    drops,
    stars,
    clouds,
    fireflies,
    shooting: null,
    flashes: 0,
    flashTimer: 4 + rng() * 8,
  };
}

/* -------------------------------------------------------------------------- */
/*  Main renderer                                                             */
/* -------------------------------------------------------------------------- */

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
  dt: number,
  nightMode: boolean,
) {
  state.time += dt;
  const theme = state.theme;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  switch (theme) {
    case "rainyCafe":
      drawRainyCafe(ctx, state, w, h, dt);
      break;
    case "cozyRoom":
      drawCozyRoom(ctx, state, w, h);
      break;
    case "sunset":
      drawSunset(ctx, state, w, h);
      break;
    case "ocean":
      drawOcean(ctx, state, w, h);
      break;
    case "starry":
      drawStarry(ctx, state, w, h, dt);
      break;
    case "forest":
      drawForest(ctx, state, w, h, dt);
      break;
    case "japaneseCafe":
      drawJapaneseCafe(ctx, state, w, h);
      break;
    case "cityNight":
      drawCityNight(ctx, state, w, h, dt);
      break;
    default:
      drawRainyCafe(ctx, state, w, h, dt);
  }
  // Warm lamp / cool moon tint overlay to sell day and night.
  if (!nightMode) {
    ctx.globalCompositeOperation = "soft-light";
    rect(ctx, 0, 0, w, h, "rgba(255, 226, 178, 0.35)");
    ctx.globalCompositeOperation = "source-over";
  }
}

/* -------------------------------------------------------------------------- */
/*  1. Rainy café window                                                      */
/* -------------------------------------------------------------------------- */

function drawRainyCafe(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
  dt: number,
) {
  rect(ctx, 0, 0, w, h, "#241C18");
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#2A201B"],
    [0.65, "#38281F"],
    [1, "#1E1714"],
  ]);
  ctx.fillRect(0, 0, w, h);

  const wx = w * 0.13;
  const wy = h * 0.1;
  const ww = w * 0.74;
  const wh = h * 0.66;

  // Window alcove shadow
  rect(ctx, wx - 8, wy - 8, ww + 16, wh + 16, "#1A1310");

  // Night sky / city glass
  const sky = gradient(ctx, 0, wy, 0, wy + wh, [
    [0, "#1D2A3D"],
    [0.55, "#33455C"],
    [1, "#5C5A5A"],
  ]);
  rect(ctx, wx, wy, ww, wh, "#1D2A3D");
  ctx.fillStyle = sky;
  ctx.fillRect(px(wx), px(wy), px(ww), px(wh));

  // Distant buildings and warm bokeh lights
  const u = h / 1000;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 16; i += 1) {
    const bx = wx + ((i * 53) % ww);
    const bh = (10 + ((i * 37) % (wh * 0.4))) * Math.max(0.6, u);
    const bw = (14 + (i % 4) * 6) * Math.max(0.6, u);
    rect(ctx, bx, wy + wh - bh, bw, bh, "#243040");
    // lit windows on the towers keep the skyline from reading as flat bars
    for (let r = 0; r < Math.floor(bh / (9 * u)); r += 1) {
      for (let c = 0; c < Math.floor(bw / (7 * u)); c += 1) {
        if ((i * 7 + r * 3 + c * 5) % 4 !== 0) continue;
        rect(
          ctx,
          bx + 3 * u + c * 7 * u,
          wy + wh - bh + 4 * u + r * 9 * u,
          2 * u,
          2.5 * u,
          (i + r + c) % 5 === 0 ? "#FFC873" : "#8FB9CE",
        );
      }
    }
  }
  for (let i = 0; i < 70; i += 1) {
    const bx = wx + ((i * 71) % ww);
    const by = wy + wh * 0.45 + ((i * 29) % (wh * 0.5));
    const warm = i % 5 !== 0;
    ctx.globalAlpha = 0.25 + ((i * 13) % 40) / 100;
    rect(ctx, bx, by, i % 7 === 0 ? 3 : 2, 2, warm ? "#FFC873" : "#9FD4E6");
  }
  ctx.globalAlpha = 1;

  // Rain streaks
  ctx.globalAlpha = 0.35;
  state.drops.forEach((drop) => {
    drop.y += drop.speed * dt;
    if (drop.y > 1) {
      drop.y = -0.05;
      drop.x = state.rng();
    }
    rect(
      ctx,
      wx + drop.x * ww,
      wy + drop.y * wh,
      1,
      Math.max(2, drop.len * wh),
      "#D7E6EF",
    );
  });
  ctx.globalAlpha = 1;

  // Condensation droplets
  for (let i = 0; i < 26; i += 1) {
    const dx = wx + ((i * 97) % ww);
    const dy = wy + ((i * 61) % wh);
    ctx.globalAlpha = 0.18;
    rect(ctx, dx, dy, 2, 3, "#EAF4FA");
  }
  ctx.globalAlpha = 1;

  // Window frame + mullions
  const frame = "#120D0B";
  rect(ctx, wx, wy, ww, 5, frame);
  rect(ctx, wx, wy + wh - 5, ww, 5, frame);
  rect(ctx, wx, wy, 5, wh, frame);
  rect(ctx, wx + ww - 5, wy, 5, wh, frame);
  rect(ctx, wx + ww / 2 - 2, wy, 4, wh, frame);
  rect(ctx, wx, wy + wh * 0.52 - 2, ww, 4, frame);
  // Sill
  rect(ctx, wx - 10, wy + wh, ww + 20, 8, "#4B3427");
  rect(ctx, wx - 10, wy + wh, ww + 20, 2, "#6B4B36");

  // Curtains
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = gradient(ctx, 0, 0, w * 0.16, 0, [
    [0, "#4A3025"],
    [1, "#2C1D17"],
  ]);
  ctx.beginPath();
  ctx.moveTo(wx - 22, wy - 12);
  ctx.lineTo(wx + 8, wy - 12);
  ctx.lineTo(wx + 16, wy + wh + 6);
  ctx.lineTo(wx - 34, wy + wh + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = gradient(ctx, w, 0, w - w * 0.16, 0, [
    [0, "#4A3025"],
    [1, "#2C1D17"],
  ]);
  ctx.beginPath();
  ctx.moveTo(wx + ww - 8, wy - 12);
  ctx.lineTo(wx + ww + 22, wy - 12);
  ctx.lineTo(wx + ww + 34, wy + wh + 6);
  ctx.lineTo(wx + ww - 16, wy + wh + 6);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Hanging lamps with flicker
  const flicker = 0.85 + Math.sin(state.time * 3.1) * 0.05 + Math.sin(state.time * 7.7) * 0.03;
  [0.28, 0.72].forEach((fx) => {
    const lx = w * fx;
    rect(ctx, lx - 1, 0, 2, h * 0.14, "#0F0B09");
    rect(ctx, lx - 7, h * 0.14, 14, 4, "#3A2A20");
    ctx.fillStyle = gradient(ctx, lx - 9, h * 0.15, lx + 9, h * 0.24, [
      [0, "#FFD79A"],
      [1, "#C9873F"],
    ]);
    ctx.beginPath();
    ctx.moveTo(lx - 9, h * 0.15);
    ctx.lineTo(lx + 9, h * 0.15);
    ctx.lineTo(lx + 5, h * 0.23);
    ctx.lineTo(lx - 5, h * 0.23);
    ctx.closePath();
    ctx.fill();
    glow(ctx, lx, h * 0.26, h * 0.34, "rgba(255, 189, 89, 0.9)", 0.3 * flicker);
  });

  // Foreground counter that anchors the whole scene
  const tableY = h * 0.875;
  rect(ctx, 0, tableY, w, h - tableY, "#3A2719");
  ctx.fillStyle = gradient(ctx, 0, tableY, 0, h, [
    [0, "#4A3322"],
    [1, "#2A1C13"],
  ]);
  ctx.fillRect(0, tableY, w, h - tableY);
  rect(ctx, 0, tableY, w, 4 * u, "#7A5638");
  rect(ctx, 0, tableY + 4 * u, w, 2 * u, "rgba(255, 189, 89, 0.16)");
  // wood grain
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 14; i += 1) {
    rect(ctx, (i * 173 * u) % w, tableY + (10 + (i % 5) * 9) * u, w * 0.18, 1.5 * u, "#1C120C");
  }
  ctx.globalAlpha = 1;

  // Mug, saucer, steam and a book on the counter
  const cupX = w * 0.8;
  const cw = 54 * u;
  const chh = 44 * u;
  const cupTop = tableY - chh - 6 * u;
  rect(ctx, cupX - cw * 0.78, tableY - 7 * u, cw * 1.56, 5 * u, "#BFA98D");
  rect(ctx, cupX - cw * 0.78, tableY - 7 * u, cw * 1.56, 1.5 * u, "#E6D6BF");
  ctx.beginPath();
  ctx.strokeStyle = "#EFE2CE";
  ctx.lineWidth = 5 * u;
  ctx.arc(cupX + cw * 0.52, cupTop + chh * 0.42, cw * 0.22, -Math.PI * 0.5, Math.PI * 0.55);
  ctx.stroke();
  rect(ctx, cupX - cw * 0.5, cupTop, cw, chh, "#EFE2CE");
  rect(ctx, cupX - cw * 0.5, cupTop, cw * 0.18, chh, "#D8C3A8");
  rect(ctx, cupX - cw * 0.5, cupTop + chh - 5 * u, cw, 5 * u, "#D8C3A8");
  rect(ctx, cupX - cw * 0.56, cupTop - 4 * u, cw * 1.12, 6 * u, "#FBF5EA");
  rect(ctx, cupX - cw * 0.42, cupTop + 1 * u, cw * 0.84, 3 * u, "#4A2E1E");
  rect(ctx, cupX - cw * 0.42, cupTop + 1 * u, cw * 0.84, 1 * u, "#7A5233");
  // book stack
  const bx = cupX - cw * 2.2;
  rect(ctx, bx, tableY - 12 * u, 74 * u, 12 * u, "#6E3F2C");
  rect(ctx, bx, tableY - 12 * u, 74 * u, 2.5 * u, "#C79063");
  rect(ctx, bx + 5 * u, tableY - 22 * u, 62 * u, 10 * u, "#3B5A57");
  rect(ctx, bx + 5 * u, tableY - 22 * u, 62 * u, 2.5 * u, "#7FA8A1");
  ctx.globalAlpha = 0.34;
  for (let i = 0; i < 5; i += 1) {
    const sy = cupTop - 10 * u - i * 9 * u;
    const sx = cupX + Math.sin(state.time * 1.4 + i) * 4 * u;
    rect(ctx, sx, sy, 2 * u, 5 * u, "#F3E7D6");
  }
  ctx.globalAlpha = 1;

  // Plant silhouette (kept fully inside the frame so it never clips)
  const len = h * 0.165;
  const plantX = Math.max(w * 0.05, len * 0.92 + 16 * u);
  const potTop = h * 0.855;
  rect(ctx, plantX - 20 * u, potTop, 40 * u, h - potTop, "#4E3325");
  rect(ctx, plantX - 24 * u, potTop, 48 * u, 7 * u, "#6B4831");
  rect(ctx, plantX - 20 * u, potTop + h * 0.06, 5 * u, h - potTop - h * 0.06, "#3A2519");
  for (let i = 0; i < 9; i += 1) {
    const angle = -Math.PI / 2 + (i - 4) * 0.26;
    const leaf = len * (0.72 + ((i * 3) % 4) * 0.09);
    ctx.strokeStyle = i % 2 === 0 ? "#2C4430" : "#20301F";
    ctx.lineWidth = 4.5 * u;
    ctx.beginPath();
    ctx.moveTo(plantX, potTop + 2 * u);
    ctx.quadraticCurveTo(
      plantX + Math.cos(angle) * leaf * 0.7,
      potTop + Math.sin(angle) * leaf * 0.7,
      plantX + Math.cos(angle) * leaf,
      potTop + Math.sin(angle) * leaf,
    );
    ctx.stroke();
  }
}

/* -------------------------------------------------------------------------- */
/*  2. Cozy bedroom                                                           */
/* -------------------------------------------------------------------------- */
/*  2. Cozy bedroom                                                           */
/* -------------------------------------------------------------------------- */
function drawCozyRoom(ctx: CanvasRenderingContext2D, state: SceneState, w: number, h: number) {
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#3B2B22"],
    [0.7, "#33251D"],
    [1, "#241A15"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Wallpaper pinstripes + skirting
  ctx.globalAlpha = 0.05;
  for (let x = 0; x < w; x += 12) rect(ctx, x, 0, 4, h * 0.7, "#F5EBDD");
  ctx.globalAlpha = 1;
  rect(ctx, 0, h * 0.7, w, 2, "#5E4332");
  rect(ctx, 0, h * 0.7, w, h * 0.3, "#4A3428");
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 18; i += 1) rect(ctx, 0, h * 0.72 + i * 3, w, 1, "#2B1C12");
  ctx.globalAlpha = 1;

  // Moonlit window with curtains
  const wx = w * 0.6;
  const wy = h * 0.12;
  const ww = w * 0.26;
  const wh = h * 0.4;
  rect(ctx, wx - 5, wy - 5, ww + 10, wh + 10, "#191310");
  ctx.fillStyle = gradient(ctx, 0, wy, 0, wy + wh, [
    [0, "#0E1830"],
    [0.7, "#22314F"],
    [1, "#3A4666"],
  ]);
  ctx.fillRect(px(wx), px(wy), px(ww), px(wh));
  state.stars.forEach((star, i) => {
    if (i % 3 !== 0) return;
    ctx.globalAlpha = 0.35 + Math.abs(Math.sin(state.time * 0.6 + star.phase)) * 0.4;
    rect(ctx, wx + star.x * ww, wy + (star.y % 0.5) * wh, 1, 1, "#EAF1F8");
  });
  ctx.globalAlpha = 1;
  glow(ctx, wx + ww * 0.66, wy + wh * 0.3, h * 0.24, "rgba(203,213,225,0.85)", 0.3);
  ctx.fillStyle = "#F4E7C3";
  ctx.beginPath();
  ctx.arc(px(wx + ww * 0.66), px(wy + wh * 0.3), Math.max(4, h * 0.045), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(34,49,79,0.85)";
  ctx.beginPath();
  ctx.arc(px(wx + ww * 0.71), px(wy + wh * 0.27), Math.max(3.5, h * 0.038), 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, wx + ww / 2 - 1, wy, 2, wh, "#191310");
  rect(ctx, wx, wy + wh * 0.55, ww, 2, "#191310");
  rect(ctx, wx - 8, wy + wh + 5, ww + 16, 4, "#5E4332");
  // curtains
  ctx.fillStyle = "#5A3B2C";
  ctx.beginPath();
  ctx.moveTo(wx - 16, wy - 10);
  ctx.lineTo(wx - 2, wy - 10);
  ctx.lineTo(wx + 2, wy + wh + 8);
  ctx.lineTo(wx - 20, wy + wh + 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(wx + ww + 2, wy - 10);
  ctx.lineTo(wx + ww + 16, wy - 10);
  ctx.lineTo(wx + ww + 20, wy + wh + 8);
  ctx.lineTo(wx + ww - 2, wy + wh + 8);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.35;
  rect(ctx, wx - 12, wy - 8, 3, wh + 12, "#7A5138");
  ctx.globalAlpha = 1;

  // Fairy lights
  ctx.strokeStyle = "#4A3A2C";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.1);
  ctx.quadraticCurveTo(w * 0.3, h * 0.2, w, h * 0.08);
  ctx.stroke();
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const lx = t * w;
    const ly = h * 0.1 + Math.sin(t * Math.PI) * h * 0.075 + 4;
    const pulse = 0.5 + Math.sin(state.time * 2.2 + i * 0.9) * 0.3;
    ctx.globalAlpha = pulse;
    rect(ctx, lx, ly, 2, 3, "#FFE0A3");
    glow(ctx, lx + 1, ly + 1, 9, "rgba(255,189,89,0.85)", 0.26 * pulse);
    ctx.globalAlpha = 1;
  }

  // Framed sunset print
  const fx = w * 0.28;
  const fy = h * 0.2;
  rect(ctx, fx - 2, fy - 2, 38, 30, "#8A6244");
  rect(ctx, fx, fy, 34, 26, "#F3E7D6");
  ctx.fillStyle = gradient(ctx, 0, fy + 4, 0, fy + 22, [
    [0, "#E58A5B"],
    [1, "#7B4B5E"],
  ]);
  ctx.fillRect(px(fx + 4), px(fy + 4), 26, 18);
  rect(ctx, fx + 13, fy + 10, 6, 6, "#FFD79A");
  rect(ctx, fx + 4, fy + 16, 26, 6, "#5C3F52");

  // Wall shelf
  const sx = w * 0.05;
  const sy = h * 0.38;
  rect(ctx, sx, sy, w * 0.19, 3, "#7A5238");
  rect(ctx, sx + 4, sy + 3, 2, 5, "#5A3C2A");
  rect(ctx, sx + w * 0.19 - 6, sy + 3, 2, 5, "#5A3C2A");
  const bookColors = ["#FFBD59", "#0799AD", "#CBD5E1", "#E58C7A", "#7E9C6B"];
  for (let i = 0; i < 7; i += 1) {
    rect(ctx, sx + 4 + i * 4, sy - 11 + (i % 2) * 1, 3, 11, bookColors[i % bookColors.length]);
  }
  // mini plant on shelf
  rect(ctx, sx + w * 0.15, sy - 8, 7, 8, "#8A5B3D");
  ctx.strokeStyle = "#4F7A4C";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.15 + 3, sy - 8);
    ctx.quadraticCurveTo(sx + w * 0.15 + 1 + i * 4, sy - 14, sx + w * 0.15 + 4 + i * 3, sy - 18);
    ctx.stroke();
  }

  // Bed
  const bx = w * 0.03;
  const by = h * 0.58;
  const bw = w * 0.36;
  const bh = h * 0.2;
  rect(ctx, bx - 7, by - 26, 9, 52, "#4E3527");
  rect(ctx, bx - 7, by - 26, 9, 3, "#6A4A35");
  rect(ctx, bx - 2, by - 6, bw + 4, 16, "#8A6244");
  rect(ctx, bx - 2, by - 6, bw + 4, 2, "#A57A55");
  // mattress + pillows
  rect(ctx, bx, by - 12, bw, 9, "#F3E7D6");
  rect(ctx, bx + 3, by - 15, bw * 0.26, 7, "#FBF5EA");
  rect(ctx, bx + 6, by - 13, bw * 0.2, 4, "#EADCC6");
  // blanket
  rect(ctx, bx + bw * 0.22, by - 10, bw * 0.79, 9, "#D98C4A");
  for (let i = 0; i < 6; i += 1) {
    rect(ctx, bx + bw * 0.24 + i * bw * 0.13, by - 10, bw * 0.055, 9, "#F2B36A");
  }
  rect(ctx, bx + bw * 0.22, by - 10, bw * 0.79, 2, "#F5EBDD");
  // folded throw at the foot
  rect(ctx, bx + bw * 0.74, by - 13, bw * 0.22, 5, "#A45E4C");
  // legs
  rect(ctx, bx + 4, by + bh * 0.6, 5, 14, "#3A281C");
  rect(ctx, bx + bw - 9, by + bh * 0.6, 5, 14, "#3A281C");

  // Rug
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#6E4136";
  ctx.beginPath();
  ctx.ellipse(px(w * 0.56), px(h * 0.87), w * 0.23, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8A5142";
  ctx.beginPath();
  ctx.ellipse(px(w * 0.56), px(h * 0.87), w * 0.17, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#F5EBDD";
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(px(w * 0.56), px(h * 0.87), w * 0.2, h * 0.085, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Sleeping cat with a tail and stripes
  const cx = w * 0.55;
  const cy = h * 0.87;
  ctx.fillStyle = "#E7B96C";
  ctx.beginPath();
  ctx.ellipse(px(cx), px(cy), 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px(cx - 9), px(cy - 1), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - 4);
  ctx.lineTo(cx - 11.5, cy - 8);
  ctx.lineTo(cx - 9, cy - 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - 4.6);
  ctx.lineTo(cx - 7.5, cy - 8);
  ctx.lineTo(cx - 6, cy - 4.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#E7B96C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy);
  ctx.quadraticCurveTo(cx + 17, cy + 1, cx + 15, cy - 4);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 3; i += 1) rect(ctx, cx - 2 + i * 4, cy - 4, 2, 8, "#B98844");
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#5B4027";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy - 1);
  ctx.lineTo(cx - 9, cy - 1);
  ctx.stroke();

  // Floor lamp
  const lx = w * 0.9;
  rect(ctx, lx, h * 0.48, 2, h * 0.42, "#3A2A20");
  rect(ctx, lx - 6, h * 0.9, 14, 3, "#3A2A20");
  ctx.fillStyle = "#F0DDB8";
  ctx.beginPath();
  ctx.moveTo(lx - 12, h * 0.49);
  ctx.lineTo(lx + 14, h * 0.49);
  ctx.lineTo(lx + 9, h * 0.38);
  ctx.lineTo(lx - 7, h * 0.38);
  ctx.closePath();
  ctx.fill();
  glow(ctx, lx + 1, h * 0.48, h * 0.36, "rgba(255, 206, 130, 0.95)", 0.3);

  // Side table + mug + book
  const tx = w * 0.74;
  const ty = h * 0.74;
  rect(ctx, tx, ty, w * 0.1, 3, "#8A6244");
  rect(ctx, tx + 3, ty + 3, 2, h * 0.16, "#5A3E2C");
  rect(ctx, tx + w * 0.1 - 5, ty + 3, 2, h * 0.16, "#5A3E2C");
  rect(ctx, tx + 6, ty - 4, 16, 3, "#B4543F");
  rect(ctx, tx + 8, ty - 6, 12, 2, "#F5EBDD");
  rect(ctx, tx + w * 0.06, ty - 12, 7, 7, "#EFE2CE");
  rect(ctx, tx + w * 0.06 + 6, ty - 10, 2, 3, "#EFE2CE");
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 3; i += 1) {
    rect(ctx, tx + w * 0.06 + 3 + Math.sin(state.time + i) * 2, ty - 16 - i * 4, 1, 3, "#F3E7D6");
  }
  ctx.globalAlpha = 1;

  // Plant + slippers
  const px0 = w * 0.44;
  rect(ctx, px0 - 6, h * 0.68, 12, h * 0.1, "#8A5B3D");
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.4;
    ctx.strokeStyle = i % 2 ? "#4C6B45" : "#5F8054";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px0, h * 0.68);
    ctx.quadraticCurveTo(
      px0 + Math.cos(a) * 12,
      h * 0.68 + Math.sin(a) * 14,
      px0 + Math.cos(a) * 20,
      h * 0.68 + Math.sin(a) * 26,
    );
    ctx.stroke();
  }
  ctx.fillStyle = "#C58A72";
  ctx.beginPath();
  ctx.ellipse(px(w * 0.36), px(h * 0.94), 7, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px(w * 0.4), px(h * 0.95), 7, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Warm lamp wash from the left
  glow(ctx, w * 0.02, h * 0.4, h * 0.85, "rgba(255, 189, 89, 0.6)", 0.2);
}
/* -------------------------------------------------------------------------- */
/*  3. Sunset                                                                 */
/* -------------------------------------------------------------------------- */
/*  3. Sunset                                                                 */
/* -------------------------------------------------------------------------- */
function drawSunset(ctx: CanvasRenderingContext2D, state: SceneState, w: number, h: number) {
  const horizon = h * 0.63;
  ctx.fillStyle = gradient(ctx, 0, 0, 0, horizon, [
    [0, "#242144"],
    [0.32, "#5C3E67"],
    [0.62, "#B2606B"],
    [0.84, "#E88F5C"],
    [1, "#FFCE86"],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  // A few early stars
  for (let i = 0; i < 14; i += 1) {
    ctx.globalAlpha = 0.25 + Math.abs(Math.sin(state.time + i)) * 0.3;
    rect(ctx, ((i * 73) % 100) / 100 * w, ((i * 31) % 60) / 100 * horizon * 0.5, 1, 1, "#F7E8DA");
  }
  ctx.globalAlpha = 1;

  // Sun sitting above the ridge
  const sunX = w * 0.54;
  const sunY = horizon - h * 0.17;
  glow(ctx, sunX, sunY, h * 0.42, "rgba(255, 211, 143, 0.9)", 0.55);
  ctx.fillStyle = "#FFE7B8";
  ctx.beginPath();
  ctx.arc(px(sunX), px(sunY), Math.max(6, h * 0.055), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#FFD190";
  ctx.beginPath();
  ctx.arc(px(sunX), px(sunY), Math.max(8, h * 0.078), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Drifting clouds
  state.clouds.forEach((cloud, index) => {
    cloud.x += cloud.speed * 0.018;
    if (cloud.x > 1.2) cloud.x = -0.3;
    ctx.globalAlpha = 0.85;
    pixelCloud(
      ctx,
      cloud.x * w,
      cloud.y * horizon * 0.9,
      cloud.w * w,
      cloud.h * 0.7,
      index % 2 ? "#F7C9A8" : "#F0AE92",
      "#B96B72",
    );
    ctx.globalAlpha = 1;
  });

  // Mountain ridges
  const ridge = (baseY: number, amp: number, color: string, phase: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 4) {
      const y =
        baseY -
        Math.abs(Math.sin(x * 0.009 + phase)) * amp -
        Math.sin(x * 0.03 + phase * 2) * amp * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
  };
  ridge(horizon + 2, h * 0.075, "#6E4A62", 1.1);
  ridge(horizon + 4, h * 0.04, "#4A3750", 3.7);

  // Sea
  ctx.fillStyle = gradient(ctx, 0, horizon, 0, h, [
    [0, "#9C5C5D"],
    [0.3, "#5E4660"],
    [1, "#241F38"],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);

  // Reflection of the sun
  for (let i = 0; i < 34; i += 1) {
    const y = horizon + 3 + i * ((h - horizon) / 36);
    const spread = 0.02 + (i / 34) * 0.2;
    const wobble = Math.sin(state.time * 1.4 + i * 0.9) * 0.015;
    const rw = w * (0.014 + (i % 4) * 0.008) * (1 + i * 0.02);
    ctx.globalAlpha = 0.5 - i * 0.012;
    rect(ctx, w * (0.54 + wobble) - rw / 2 + Math.sin(i * 1.7) * w * spread * 0.4, y, rw, 1.6, "#FFD79A");
  }
  ctx.globalAlpha = 1;

  // Wave glints
  for (let i = 0; i < 40; i += 1) {
    const gx = ((i * 79) % 100) / 100 * w;
    const gy = horizon + 8 + ((i * 43) % 100) / 100 * (h - horizon - 10);
    ctx.globalAlpha = 0.12 + Math.sin(state.time + i) * 0.06;
    rect(ctx, gx, gy, 3 + (i % 3) * 2, 1, "#E7B98F");
  }
  ctx.globalAlpha = 1;

  // A dark headland so the palms stand on land, not on the water.
  ctx.fillStyle = "#221A2A";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.78);
  ctx.quadraticCurveTo(w * 0.07, h * 0.76, w * 0.115, h * 0.83);
  ctx.quadraticCurveTo(w * 0.16, h * 0.9, w * 0.2, h);
  ctx.closePath();
  ctx.fill();

  // Palm silhouettes
  const palm = (baseX: number, scale: number) => {
    const topX = baseX - 4 * scale;
    const topY = h * 0.58;
    ctx.fillStyle = "#241A2C";
    // tapered trunk
    ctx.beginPath();
    ctx.moveTo(baseX - 3.2 * scale, h);
    ctx.quadraticCurveTo(baseX + 8 * scale, h * 0.8, topX + 1.8 * scale, topY);
    ctx.lineTo(topX - 1.8 * scale, topY);
    ctx.quadraticCurveTo(baseX + 2.5 * scale, h * 0.8, baseX - 6 * scale, h);
    ctx.closePath();
    ctx.fill();
    // fronds
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + (i - 3) * 0.44;
      const len = (i % 2 ? 32 : 26) * scale;
      const ex = topX + Math.cos(a) * len;
      const ey = topY + Math.sin(a) * len + 5 * scale;
      const mx = topX + Math.cos(a) * len * 0.55;
      const my = topY + Math.sin(a) * len * 0.55 - 4 * scale;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(mx, my - 3 * scale, ex, ey);
      ctx.quadraticCurveTo(mx, my + 4 * scale, topX, topY);
      ctx.fill();
    }
    // coconuts
    ctx.beginPath();
    ctx.arc(topX + 2.2 * scale, topY + 2.4 * scale, Math.max(1.5, 2.1 * scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(topX - 1.6 * scale, topY + 3 * scale, Math.max(1.2, 1.8 * scale), 0, Math.PI * 2);
    ctx.fill();
  };
  palm(w * 0.055, 1.15);
  palm(w * 0.105, 0.85);

  // Birds
  for (let i = 0; i < 5; i += 1) {
    const bx = w * 0.28 + i * w * 0.05 + Math.sin(state.time * 0.3 + i) * w * 0.008;
    const by = h * 0.22 + (i % 2) * h * 0.035;
    ctx.strokeStyle = "rgba(40,32,44,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by);
    ctx.quadraticCurveTo(bx - 1.5, by - 2, bx, by);
    ctx.quadraticCurveTo(bx + 1.5, by - 2, bx + 3, by);
    ctx.stroke();
  }
}
/* -------------------------------------------------------------------------- */
/*  4. Ocean                                                                  */
/* -------------------------------------------------------------------------- */
/*  4. Ocean                                                                  */
/* -------------------------------------------------------------------------- */
function drawOcean(ctx: CanvasRenderingContext2D, state: SceneState, w: number, h: number) {
  const horizon = h * 0.5;
  ctx.fillStyle = gradient(ctx, 0, 0, 0, horizon, [
    [0, "#7EC4D6"],
    [0.55, "#B6E0E4"],
    [1, "#F6EBD6"],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  glow(ctx, w * 0.24, h * 0.14, h * 0.4, "rgba(255, 246, 218, 0.9)", 0.55);
  ctx.fillStyle = "#FFF6DE";
  ctx.beginPath();
  ctx.arc(px(w * 0.24), px(h * 0.14), Math.max(5, h * 0.045), 0, Math.PI * 2);
  ctx.fill();

  state.clouds.forEach((cloud) => {
    cloud.x += cloud.speed * 0.02;
    if (cloud.x > 1.2) cloud.x = -0.3;
    ctx.globalAlpha = 0.9;
    pixelCloud(ctx, cloud.x * w, cloud.y * horizon, cloud.w * w, cloud.h * 0.8, "#FBF8EF", "#D9E8E4");
    ctx.globalAlpha = 1;
  });

  // Sea base so no gap shows through the wave layers
  ctx.fillStyle = gradient(ctx, 0, horizon, 0, h, [
    [0, "#3AA2B0"],
    [0.45, "#0E7F94"],
    [1, "#053E4C"],
  ]);
  ctx.fillRect(0, horizon - 2, w, h - horizon + 2);

  const layers = [
    { color: "#2E93A4", y: horizon - 1, amp: 0.012, speed: 0.8 },
    { color: "#127F94", y: horizon + h * 0.1, amp: 0.018, speed: 1.2 },
    { color: "#0A6478", y: horizon + h * 0.22, amp: 0.024, speed: 0.7 },
    { color: "#064C5C", y: horizon + h * 0.36, amp: 0.03, speed: 1.05 },
  ];
  layers.forEach((layer, index) => {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, layer.y);
    for (let x = 0; x <= w; x += 4) {
      const y =
        layer.y +
        Math.sin(x * 0.028 + state.time * layer.speed + index) * h * layer.amp +
        Math.sin(x * 0.011 + state.time * layer.speed * 0.6) * h * layer.amp * 0.8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // foam along the crest
    ctx.globalAlpha = 0.22;
    for (let x = 0; x < w; x += 7) {
      const y =
        layer.y +
        Math.sin(x * 0.028 + state.time * layer.speed + index) * h * layer.amp +
        Math.sin(x * 0.011 + state.time * layer.speed * 0.6) * h * layer.amp * 0.8;
      if ((x + index * 5) % 21 < 7) rect(ctx, x, y + 1, 5, 1, "#E9F6F2");
    }
    ctx.globalAlpha = 1;
  });

  // Sun glitter path on the water
  for (let i = 0; i < 30; i += 1) {
    const gy = horizon + 4 + i * ((h - horizon) / 32);
    const gx = w * 0.24 + Math.sin(i * 1.9 + state.time) * w * 0.03 + (i % 3 - 1) * 6;
    ctx.globalAlpha = 0.35 - i * 0.008;
    rect(ctx, gx, gy, 5 + (i % 4) * 3, 1.5, "#FFF3D2");
  }
  ctx.globalAlpha = 1;

  // Gulls
  for (let i = 0; i < 3; i += 1) {
    const gx = w * (0.62 + i * 0.09) + Math.sin(state.time * 0.5 + i) * w * 0.015;
    const gy = h * (0.18 + (i % 2) * 0.07);
    ctx.strokeStyle = "rgba(37,37,37,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx - 4, gy);
    ctx.quadraticCurveTo(gx - 2, gy - 3, gx, gy);
    ctx.quadraticCurveTo(gx + 2, gy - 3, gx + 4, gy);
    ctx.stroke();
  }
}
/* -------------------------------------------------------------------------- */
/*  5. Starry sky                                                             */
/* -------------------------------------------------------------------------- */
/*  5. Starry sky                                                             */
/* -------------------------------------------------------------------------- */
function drawStarry(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
  dt: number,
) {
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#070C1E"],
    [0.4, "#152040"],
    [0.7, "#2A3253"],
    [1, "#0E1224"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Soft milky way made from a few blurred bands
  const band = (offset: number, alpha: number, width: number) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, width);
    g.addColorStop(0, "rgba(180, 199, 240, 0.5)");
    g.addColorStop(0.6, "rgba(150, 170, 220, 0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(w * 0.6, h * 0.3 + offset);
    ctx.rotate(-0.42);
    ctx.scale(1, 0.16);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(-width, -width, width * 2, width * 2);
    ctx.restore();
  };
  band(-h * 0.05, 0.5, w * 0.5);
  band(h * 0.02, 0.4, w * 0.42);
  band(h * 0.08, 0.3, w * 0.36);

  state.stars.forEach((star, i) => {
    const twinkle = 0.4 + Math.abs(Math.sin(state.time * 0.8 + star.phase)) * 0.6;
    ctx.globalAlpha = star.brightness * twinkle;
    const size = i % 17 === 0 ? 2 : 1;
    rect(ctx, star.x * w, star.y * h, size, size, i % 9 === 0 ? "#FFE3B0" : "#EAF2FF");
  });
  ctx.globalAlpha = 1;

  state.flashTimer -= dt;
  if (state.flashTimer <= 0) {
    state.shooting = { x: 0.15 + Math.random() * 0.5, y: 0.1 + Math.random() * 0.15, t: 0 };
    state.flashTimer = 9 + Math.random() * 12;
  }
  if (state.shooting) {
    state.shooting.t += dt;
    const t = state.shooting.t;
    const sx = (state.shooting.x + t * 0.22) * w;
    const sy = (state.shooting.y + t * 0.09) * h;
    ctx.globalAlpha = Math.max(0, 1 - t / 1.2);
    ctx.strokeStyle = "#F3F7FF";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - w * 0.06, sy - h * 0.025);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (t > 1.2) state.shooting = null;
  }

  // Pine silhouettes before the mountains
  drawPine(ctx, w * 0.08, h * 0.82, h * 0.28, "#101828");
  drawPine(ctx, w * 0.16, h * 0.84, h * 0.21, "#0D1422");
  drawPine(ctx, w * 0.93, h * 0.85, h * 0.24, "#0D1422");

  // Mountains
  const ridge = (baseY: number, amplitude: number, color: string, seedOffset: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= w; x += 5) {
      const y =
        baseY -
        Math.abs(Math.sin(x * 0.012 + seedOffset)) * amplitude -
        Math.sin(x * 0.05 + seedOffset) * amplitude * 0.15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  ridge(h * 0.74, h * 0.15, "#1B2238", 1.2);
  ridge(h * 0.84, h * 0.11, "#0F1524", 3.4);

  // Lake with reflected starlight
  ctx.globalAlpha = 0.5;
  rect(ctx, 0, h * 0.89, w, h * 0.11, "#18233D");
  for (let i = 0; i < 28; i += 1) {
    const rx = ((i * 97) % 100) / 100;
    const ry = h * 0.9 + ((i * 41) % 100) / 100 * h * 0.1;
    ctx.globalAlpha = 0.18 + Math.abs(Math.sin(state.time + i)) * 0.18;
    rect(ctx, rx * w, ry, 2, 1, "#DCE7FF");
  }
  ctx.globalAlpha = 1;

  // Camp fire
  const fx = w * 0.13;
  const fy = h * 0.93;
  glow(ctx, fx, fy, h * 0.34, "rgba(255, 168, 84, 0.95)", 0.32);
  ctx.strokeStyle = "#5A4030";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(fx - 8, fy);
  ctx.lineTo(fx + 8, fy - 3);
  ctx.moveTo(fx - 7, fy - 3);
  ctx.lineTo(fx + 8, fy);
  ctx.stroke();
  const flame = 0.8 + Math.sin(state.time * 7) * 0.2;
  ctx.fillStyle = "#FFB25C";
  ctx.beginPath();
  ctx.moveTo(fx - 4, fy - 2);
  ctx.quadraticCurveTo(fx - 2, fy - 13 * flame, fx, fy - 15 * flame);
  ctx.quadraticCurveTo(fx + 3, fy - 10 * flame, fx + 4, fy - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFE1A0";
  ctx.beginPath();
  ctx.moveTo(fx - 2, fy - 2);
  ctx.quadraticCurveTo(fx - 1, fy - 8 * flame, fx + 1, fy - 9 * flame);
  ctx.quadraticCurveTo(fx + 2, fy - 5 * flame, fx + 2, fy - 2);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    const t = (state.time * 0.4 + i * 0.2) % 1;
    ctx.globalAlpha = (1 - t) * 0.6;
    rect(ctx, fx + Math.sin(i * 3 + state.time) * 6 * t, fy - 12 - t * 20, 1, 1, "#FFD79A");
  }
  ctx.globalAlpha = 1;
}
/* -------------------------------------------------------------------------- */
/*  6. Forest rain                                                            */
/* -------------------------------------------------------------------------- */
/*  6. Forest rain                                                            */
/* -------------------------------------------------------------------------- */
function drawForest(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
  dt: number,
) {
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#1B2822"],
    [0.45, "#2C3E34"],
    [1, "#131B17"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Canopy depth at the top — soft, never a hard black band.
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h * 0.3, [
    [0, "rgba(10,22,17,0.92)"],
    [0.55, "rgba(12,26,20,0.35)"],
    [1, "rgba(12,26,20,0)"],
  ]);
  ctx.fillRect(0, 0, w, h * 0.3);
  softEllipse(ctx, w * 0.18, h * 0.02, w * 0.4, h * 0.18, "rgba(9,20,15,0.9)", 0.5);
  softEllipse(ctx, w * 0.68, h * 0.01, w * 0.5, h * 0.2, "rgba(9,20,15,0.9)", 0.45);

  // Mist
  softEllipse(ctx, w * 0.2, h * 0.55, w * 0.5, h * 0.16, "rgba(190, 214, 196, 0.8)", 0.09);
  softEllipse(ctx, w * 0.75, h * 0.4, w * 0.42, h * 0.13, "rgba(210, 228, 212, 0.8)", 0.08);
  softEllipse(ctx, w * 0.5, h * 0.68, w * 0.6, h * 0.12, "rgba(180, 206, 190, 0.8)", 0.07);

  // Back tree line
  const backTrees = 11;
  for (let i = 0; i < backTrees; i += 1) {
    const tx = ((i * 53 + 17) % 100) / 100 * w;
    const height = h * (0.3 + ((i * 37) % 22) / 100);
    drawPine(ctx, tx, h * 0.8, height, "#2F4638");
  }
  // Front tree line
  const frontTrees = 6;
  for (let i = 0; i < frontTrees; i += 1) {
    const tx = ((i * 89 + 9) % 100) / 100 * w;
    if (tx > w * 0.25 && tx < w * 0.45) continue;
    const height = h * (0.5 + ((i * 41) % 22) / 100);
    drawPine(ctx, tx, h * 0.94, height, "#16241C");
  }

  // Ground
  ctx.fillStyle = "#111C16";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.9);
  for (let x = 0; x <= w; x += 6) {
    ctx.lineTo(x, h * 0.9 + Math.sin(x * 0.02) * h * 0.015);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Ferns and grass tufts
  for (let i = 0; i < 22; i += 1) {
    const gx = ((i * 47 + 13) % 100) / 100 * w;
    const gy = h * 0.9 + ((i * 31) % 10) / 100 * h * 0.1;
    ctx.strokeStyle = i % 2 ? "#2C4A34" : "#223A2A";
    ctx.lineWidth = 1.5;
    for (let j = 0; j < 3; j += 1) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + (j - 1) * 5, gy - 6, gx + (j - 1) * 9, gy - 11 - j);
      ctx.stroke();
    }
  }

  // A mossy rock
  ctx.fillStyle = "#26362C";
  ctx.beginPath();
  ctx.ellipse(px(w * 0.62), px(h * 0.9), 14, 6, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#314537";
  ctx.beginPath();
  ctx.ellipse(px(w * 0.61), px(h * 0.895), 9, 3.5, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Rain
  ctx.globalAlpha = 0.25;
  state.drops.forEach((drop) => {
    drop.y += drop.speed * dt * 1.2;
    if (drop.y > 1) {
      drop.y = -0.05;
      drop.x = state.rng();
    }
    rect(ctx, drop.x * w, drop.y * h, 1, Math.max(2, drop.len * h * 0.9), "#D6E6DC");
  });
  ctx.globalAlpha = 1;

  // Fireflies
  state.fireflies.forEach((fly) => {
    const fx = fly.x * w + Math.sin(state.time * 0.5 + fly.phase) * 8;
    const fy = fly.y * h + Math.cos(state.time * 0.4 + fly.phase) * 5;
    const pulse = 0.3 + Math.abs(Math.sin(state.time * 1.4 + fly.phase)) * 0.7;
    ctx.globalAlpha = pulse * fly.brightness;
    rect(ctx, fx, fy, 1.5, 1.5, "#E9E28A");
    glow(ctx, fx + 1, fy + 1, 7, "rgba(233, 226, 138, 0.9)", 0.22 * pulse);
    ctx.globalAlpha = 1;
  });
}
/* -------------------------------------------------------------------------- */
/*  7. Japanese café                                                          */
/* -------------------------------------------------------------------------- */
/*  7. Japanese café                                                          */
/* -------------------------------------------------------------------------- */
function drawJapaneseCafe(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
) {
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#241B16"],
    [0.6, "#3A2B21"],
    [1, "#201712"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Vertical wood panelling
  ctx.globalAlpha = 0.12;
  for (let x = 0; x < w; x += 14) rect(ctx, x, 0, 2, h * 0.78, "#0E0906");
  ctx.globalAlpha = 1;

  // Shoji screens
  const sx = w * 0.06;
  const sy = h * 0.14;
  const sw = w * 0.52;
  const sh = h * 0.48;
  rect(ctx, sx - 6, sy - 6, sw + 12, sh + 12, "#191210");
  ctx.fillStyle = gradient(ctx, 0, sy, 0, sy + sh, [
    [0, "#F7EDD6"],
    [1, "#E4D0A8"],
  ]);
  ctx.fillRect(px(sx), px(sy), px(sw), px(sh));
  glow(ctx, sx + sw / 2, sy + sh / 2, sw * 0.7, "rgba(255, 236, 190, 0.55)", 0.22);

  // Soft bamboo shadows behind the paper
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 4; i += 1) {
    const bx = sx + sw * (0.16 + i * 0.22);
    rect(ctx, bx, sy + sh * 0.18, 2, sh * 0.82, "#2B3B2B");
    for (let j = 0; j < 3; j += 1) {
      ctx.fillStyle = "#2B3B2B";
      ctx.beginPath();
      ctx.ellipse(bx + 9, sy + sh * (0.3 + j * 0.18), 11, 3.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Shoji frame
  ctx.strokeStyle = "#4A3629";
  ctx.lineWidth = 3;
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(sx + (sw / 4) * i, sy);
    ctx.lineTo(sx + (sw / 4) * i, sy + sh);
    ctx.stroke();
  }
  for (let j = 1; j < 3; j += 1) {
    ctx.beginPath();
    ctx.moveTo(sx, sy + (sh / 3) * j);
    ctx.lineTo(sx + sw, sy + (sh / 3) * j);
    ctx.stroke();
  }
  rect(ctx, sx - 6, sy + sh, sw + 12, 5, "#5A4030");

  // Hanging scroll
  const hx = w * 0.655;
  const hy = h * 0.2;
  rect(ctx, hx - 1, h * 0.08, 2, hy - h * 0.08, "#2B1F18");
  rect(ctx, hx - 11, hy, 22, 34, "#3A2A20");
  rect(ctx, hx - 9, hy + 2, 18, 30, "#EFE4CC");
  ctx.strokeStyle = "#5A4A3A";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hx, hy + 16, 6, 0, Math.PI * 2);
  ctx.stroke();
  rect(ctx, hx - 12, hy + 34, 24, 2, "#2B1F18");

  // Paper lanterns
  [0.78, 0.92].forEach((fx, index) => {
    const lx = w * fx;
    rect(ctx, lx - 1, 0, 2, h * 0.17, "#2B1F18");
    const ly = h * 0.17;
    const lw = w * 0.06;
    const lh = h * 0.16;
    ctx.fillStyle = gradient(ctx, lx - lw / 2, 0, lx + lw / 2, 0, [
      [0, "#C24A32"],
      [0.5, "#F49A57"],
      [1, "#C24A32"],
    ]);
    ctx.beginPath();
    ctx.ellipse(px(lx), px(ly + lh / 2), lw / 2, lh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7A2E1F";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(px(lx), px(ly + lh / 2), (lw / 2) * (1 - i * 0.12), lh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    rect(ctx, lx - lw * 0.3, ly - 3, lw * 0.6, 3, "#3A2A20");
    rect(ctx, lx - lw * 0.3, ly + lh, lw * 0.6, 2, "#3A2A20");
    const pulse = 0.85 + Math.sin(state.time * 2 + index) * 0.1;
    glow(ctx, lx, ly + lh * 0.6, h * 0.32, "rgba(255, 154, 84, 0.95)", 0.3 * pulse);
  });

  // Beams
  rect(ctx, 0, h * 0.1, w, 6, "#5A4030");
  rect(ctx, 0, h * 0.1, w, 2, "#7A5A42");
  rect(ctx, w * 0.62, 0, 7, h * 0.8, "#4A3527");

  // Tatami floor
  rect(ctx, 0, h * 0.78, w, h * 0.22, "#7E6C45");
  for (let i = 0; i < 6; i += 1) {
    rect(ctx, (i * w) / 6, h * 0.78, 2, h * 0.22, "#5F4F2F");
  }
  rect(ctx, 0, h * 0.78, w, 2, "#A38F5C");
  ctx.globalAlpha = 0.15;
  for (let y = h * 0.8; y < h; y += 4) rect(ctx, 0, y, w, 1, "#3F3520");
  ctx.globalAlpha = 1;

  // Zabuton cushions
  [0.24, 0.52].forEach((fx) => {
    ctx.fillStyle = "#5C4A6E";
    ctx.beginPath();
    ctx.ellipse(px(w * fx), px(h * 0.94), 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6E5A80";
    ctx.beginPath();
    ctx.ellipse(px(w * fx), px(h * 0.935), 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Low table with tea set
  const tx = w * 0.24;
  const ty = h * 0.83;
  const tw = w * 0.28;
  rect(ctx, tx, ty, tw, 6, "#4A3324");
  rect(ctx, tx, ty, tw, 2, "#6E4E36");
  rect(ctx, tx + 8, ty + 6, 4, h * 0.12, "#382518");
  rect(ctx, tx + tw - 12, ty + 6, 4, h * 0.12, "#382518");
  ctx.fillStyle = "#2F4A45";
  ctx.beginPath();
  ctx.ellipse(px(tx + tw * 0.42), px(ty - 6), 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, tx + tw * 0.42 + 7, ty - 8, 5, 2, "#2F4A45");
  rect(ctx, tx + tw * 0.42 - 1, ty - 13, 3, 3, "#2F4A45");
  rect(ctx, tx + tw * 0.58, ty - 5, 5, 5, "#EFE2CE");
  rect(ctx, tx + tw * 0.68, ty - 5, 5, 5, "#EFE2CE");
  rect(ctx, tx + tw * 0.14, ty - 4, 12, 4, "#D9C9A8");
  rect(ctx, tx + tw * 0.17, ty - 7, 3, 3, "#FBF5EA");
  rect(ctx, tx + tw * 0.21, ty - 7, 3, 3, "#FBF5EA");
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 4; i += 1) {
    rect(ctx, tx + tw * 0.42 + Math.sin(state.time + i) * 2, ty - 17 - i * 4, 1, 3, "#F3E7D6");
  }
  ctx.globalAlpha = 1;

  // Bonsai
  const bx = w * 0.9;
  rect(ctx, bx - 9, h * 0.66, 18, 10, "#8A5B3D");
  rect(ctx, bx - 10, h * 0.66, 20, 2, "#A87250");
  ctx.strokeStyle = "#4A3524";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx, h * 0.66);
  ctx.quadraticCurveTo(bx + 9, h * 0.58, bx + 2, h * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#4C6B45";
  ctx.beginPath();
  ctx.ellipse(bx + 5, h * 0.49, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx - 9, h * 0.56, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm floor glow from lanterns
  glow(ctx, w * 0.86, h * 0.8, h * 0.4, "rgba(255, 170, 90, 0.6)", 0.18);
}
/* -------------------------------------------------------------------------- */
/*  8. City night                                                             */
/* -------------------------------------------------------------------------- */

function drawCityNight(
  ctx: CanvasRenderingContext2D,
  state: SceneState,
  w: number,
  h: number,
  dt: number,
) {
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, "#0E1220"],
    [0.55, "#241F33"],
    [1, "#4A2F35"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Moon
  glow(ctx, w * 0.82, h * 0.16, h * 0.4, "rgba(203, 213, 225, 0.6)", 0.35);
  ctx.fillStyle = "#E9EEE7";
  ctx.beginPath();
  ctx.arc(px(w * 0.82), px(h * 0.16), Math.max(5, h * 0.045), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(36,31,51,0.9)";
  ctx.beginPath();
  ctx.arc(px(w * 0.845), px(h * 0.145), Math.max(4, h * 0.04), 0, Math.PI * 2);
  ctx.fill();

  // Skyline layers
  const skyline = (
    baseY: number,
    color: string,
    seed: number,
    litColor: string,
    alpha: number,
  ) => {
    ctx.globalAlpha = alpha;
    let x = -10;
    let i = 0;
    while (x < w) {
      const bw = 16 + ((i * 71 + seed) % 34);
      const bh = 18 + ((i * 47 + seed * 3) % Math.max(20, baseY * 0.55));
      rect(ctx, x, baseY - bh, bw, bh, color);
      // windows
      for (let wy = baseY - bh + 4; wy < baseY - 4; wy += 6) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
          if ((wx * 13 + wy * 7 + seed) % 11 < 6) {
            ctx.globalAlpha = alpha * (0.35 + ((wx + wy) % 5) * 0.12);
            rect(ctx, wx, wy, 2, 3, litColor);
          }
        }
      }
      ctx.globalAlpha = alpha;
      x += bw + 2;
      i += 1;
    }
    ctx.globalAlpha = 1;
  };
  skyline(h * 0.72, "#1B1F2E", 3, "#FFC873", 0.95);
  skyline(h * 0.86, "#12151F", 9, "#FFD79A", 1);

  // Street light glow
  glow(ctx, w * 0.24, h * 0.9, h * 0.3, "rgba(255, 170, 90, 0.9)", 0.25);
  glow(ctx, w * 0.72, h * 0.94, h * 0.3, "rgba(7, 153, 173, 0.8)", 0.2);

  // Rain on the glass
  ctx.globalAlpha = 0.3;
  state.drops.forEach((drop) => {
    drop.y += drop.speed * dt * 0.8;
    if (drop.y > 1) {
      drop.y = -0.05;
      drop.x = state.rng();
    }
    rect(ctx, drop.x * w, drop.y * h, 1, Math.max(2, drop.len * h), "#CFE0EA");
  });
  ctx.globalAlpha = 1;

  // Foreground window frame
  rect(ctx, 0, 0, w, h * 0.06, "#0B0C12");
  rect(ctx, 0, h * 0.94, w, h * 0.06, "#0B0C12");
  rect(ctx, 0, 0, w * 0.04, h, "#0B0C12");
  rect(ctx, w * 0.96, 0, w * 0.04, h, "#0B0C12");
  rect(ctx, w * 0.5 - 2, 0, 4, h, "#0B0C12");
}
