import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";
import { createSceneState, drawScene } from "@/lib/background/renderScene";
import { buildLayout, drawProp, drawRoom, drawTable } from "@/lib/world/scene";
import { drawCharacter, drawNameTag, drawSpeechBubble } from "@/lib/world/character";
import { getAvatar, AVATARS } from "@/lib/data/avatars";
import { SEED_TABLES } from "@/lib/data/tables";
import type { SceneThemeId } from "@/lib/types";

const out = "/tmp/canvastest/out";
fs.mkdirSync(out, { recursive: true });
const save = (canvas: any, name: string) => {
  fs.writeFileSync(`${out}/${name}.png`, canvas.toBuffer("image/png"));
  console.log("saved", name);
};

const themes: SceneThemeId[] = [
  "rainyCafe", "cozyRoom", "sunset", "ocean",
  "starry", "forest", "japaneseCafe", "cityNight",
];
themes.forEach((theme) => {
  const w = 480, h = 200, scale = 2;
  const canvas = createCanvas(w * scale, h * scale);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  const state = createSceneState(theme);
  for (let f = 0; f < 140; f += 1) drawScene(ctx, state, w, h, 0.016, true);
  save(canvas, `scene-${theme}`);
});

const w = 660, h = 176, scale = 2;
const canvas = createCanvas(w * scale, h * scale);
const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
ctx.scale(scale, scale);
const layout = buildLayout(w, h, SEED_TABLES);
drawRoom(ctx, layout, 3.2, true);
layout.props.forEach((prop) => drawProp(ctx, prop, layout));
layout.tables.forEach((table, index) => {
  drawTable(ctx, table, SEED_TABLES[index], 4.1, {
    hovered: false,
    selected: index === 0,
    joined: index === 1,
  });
});
// Populate the tables like the real app does
SEED_TABLES.forEach((table, tableIndex) => {
  const tableLayout = layout.tables[tableIndex];
  table.participants.forEach((participant, seatIndex) => {
    const seat = tableLayout.seats[seatIndex];
    if (!seat) return;
    const avatar = getAvatar(participant.avatarId);
    drawCharacter(ctx, seat.x, seat.y, avatar, {
      state: participant.speaking ? "talk" : "sit",
      time: 2.4 + seatIndex,
      facing: seat.x < tableLayout.x ? 1 : -1,
      speaking: participant.speaking,
      scale: h / 170,
    });
    drawNameTag(ctx, seat.x, seat.y - 30 * (h / 170), participant.nickname, {
      speaking: participant.speaking,
      isHost: participant.isHost,
      muted: !participant.micOn,
      fontScale: h / 170,
    });
  });
});

const look = getAvatar("moss");
drawCharacter(ctx, 330, 150, look, { state: "idle", time: 1.2, facing: 1, scale: h / 170 });
drawNameTag(ctx, 330, 150 - 30 * (h / 170), "Linh", { self: true, fontScale: h / 170 });
drawSpeechBubble(ctx, 250, 108, "Mưa to quá, ai cũng trú mưa hết rồi", h / 170);
save(canvas, "world");

const sheet = createCanvas(560, 150);
const sctx = sheet.getContext("2d") as unknown as CanvasRenderingContext2D;
sctx.fillStyle = "#2A201B";
sctx.fillRect(0, 0, 560, 150);
sctx.scale(2, 2);
AVATARS.forEach((avatar, index) => {
  drawCharacter(sctx, 22 + index * 34, 68, avatar, {
    state: index === 2 ? "wave" : index === 4 ? "walk" : "idle",
    time: 1.4 + index,
    facing: 1,
    scale: 1,
  });
});
save(sheet, "avatars");
