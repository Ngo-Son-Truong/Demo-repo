/**
 * Bakes the generated pixel-art scenery into static image assets.
 *
 * The app used to redraw each landscape on a small canvas and upscale it with
 * `image-rendering: pixelated`, which made large areas look soft. We now render
 * the same artwork once, at print resolution, and ship it as PNG.
 *
 *   npm run assets
 *
 * Output: public/assets/scenes/<theme>-wide.webp   (2080x800)
 *         public/assets/scenes/<theme>.webp        (1600x1000)
 *         public/assets/scenes/<theme>-tall.webp   (760x1280)
 */
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCENES } from "@/lib/data/scenes";
import { createSceneState, drawScene } from "@/lib/background/renderScene";
import type { SceneState } from "@/lib/background/renderScene";
import type { SceneThemeId } from "@/lib/types";

interface Variant {
  suffix: string;
  width: number;
  height: number;
}

const VARIANTS: Variant[] = [
  // Matches the wide activity-area strip on desktop.
  { suffix: "-wide", width: 2080, height: 800 },
  // Default: landing hero and most mid-size containers.
  { suffix: "", width: 1600, height: 1000 },
  // Phones: the scene fills a portrait viewport.
  { suffix: "-tall", width: 760, height: 1280 },
];

const OUT_DIR = join(process.cwd(), "public", "assets", "scenes");

function render(theme: SceneThemeId, variant: Variant) {
  const canvas = createCanvas(variant.width, variant.height);
  const ctx = canvas.getContext("2d");
  const state: SceneState = createSceneState(theme);

  // A fixed mid-animation timestamp keeps every build deterministic while still
  // catching a rain/cloud frame that looks "alive".
  state.time = 7.5;
  state.shooting = null;

  drawScene(ctx as unknown as CanvasRenderingContext2D, state, variant.width, variant.height, 0, true);
  return canvas;
}

const WEBP_QUALITY = 94;

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(OUT_DIR), { recursive: true });

  let total = 0;
  for (const scene of SCENES) {
    for (const variant of VARIANTS) {
      const canvas = render(scene.id, variant);
      const file = join(OUT_DIR, `${scene.id}${variant.suffix}.webp`);
      const buffer = canvas.toBuffer("image/webp", WEBP_QUALITY);
      writeFileSync(file, buffer);
      total += buffer.byteLength;
      console.log(
        `${scene.id}${variant.suffix}  ${variant.width}x${variant.height}  ${(buffer.byteLength / 1024).toFixed(0)} KB`,
      );
    }
  }

  const assets = VARIANTS.flatMap((variant) =>
    SCENES.map((scene) => join(OUT_DIR, `${scene.id}${variant.suffix}.webp`)),
  );
  const missing = assets.filter((file) => {
    try {
      return statSync(file).size === 0;
    } catch {
      return true;
    }
  });

  console.log(`\n${assets.length} assets · ${(total / 1024 / 1024).toFixed(2)} MB total`);
  if (missing.length) {
    console.error("missing files:", missing);
    process.exit(1);
  }
}

main();
