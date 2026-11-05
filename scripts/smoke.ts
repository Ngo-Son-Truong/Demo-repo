/* Runtime smoke test: renders every scene + the café world with a stub canvas context. */
import { createSceneState, drawScene } from "@/lib/background/renderScene";
import { buildLayout, drawProp, drawRoom, drawTable } from "@/lib/world/scene";
import { drawCharacter, drawNameTag, drawSpeechBubble } from "@/lib/world/character";
import { getAvatar } from "@/lib/data/avatars";
import { SEED_TABLES } from "@/lib/data/tables";
import type { SceneThemeId } from "@/lib/types";

function makeCtx() {
  const gradient = { addColorStop: () => {} };
  const ctx: Record<string, unknown> = {
    canvas: { width: 600, height: 160 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[String(prop)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const ctx = makeCtx();
const themes: SceneThemeId[] = [
  "rainyCafe",
  "cozyRoom",
  "sunset",
  "ocean",
  "starry",
  "forest",
  "japaneseCafe",
  "cityNight",
];

themes.forEach((theme) => {
  const state = createSceneState(theme);
  for (let i = 0; i < 90; i += 1) drawScene(ctx, state, 420, 150, 0.016, i % 2 === 0);
  console.log("scene ok:", theme);
});

const layout = buildLayout(640, 170, SEED_TABLES);
drawRoom(ctx, layout, 3.2, true);
layout.props.forEach((prop) => drawProp(ctx, prop, layout));
layout.tables.forEach((table, index) => {
  drawTable(ctx, table, SEED_TABLES[index], 4.1, { hovered: index === 0, selected: index === 1, joined: index === 2 });
});
const look = getAvatar("moss");
(["idle", "walk", "sit", "wave", "talk"] as const).forEach((state) => {
  drawCharacter(ctx, 120, 90, look, { state, time: 1.4, facing: 1, speaking: state === "talk", scale: 1 });
});
drawNameTag(ctx, 120, 70, "Linh", { speaking: true, isHost: true });
drawSpeechBubble(ctx, 160, 60, "Mưa to quá, ai cũng vào đây trú mưa hết rồi");
console.log("world ok:", layout.tables.length, "tables");
