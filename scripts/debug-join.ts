const gradient = { addColorStop: () => {} };
const ctx: any = new Proxy(
  {
    canvas: { width: 600, height: 160 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  },
  { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p as string] = v; return true; } },
);
const canvas: any = {
  width: 0, height: 0, style: {}, getContext: () => ctx,
  addEventListener: () => {}, removeEventListener: () => {}, focus: () => {},
  parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 320 }) },
};
(globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {} };
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).performance = { now: () => Date.now() };

import { CafeWorld } from "@/lib/world/CafeWorld";
import { SEED_TABLES } from "@/lib/data/tables";

const profile = { id: "user-1", nickname: "Linh", avatarId: "moss", status: "chill" };
const tables = SEED_TABLES.map((t) => ({ ...t, participants: [...t.participants] }));
const world: any = new CafeWorld(canvas, {
  tables, profile, activeTableId: null, selectedTableId: null, bubbles: {},
  callbacks: { onSelectTable: () => {}, onJoinTable: () => {} },
});
(world as any).onResize();
let joined = tables.map((t) => t.id === "table-window" ? { ...t, participants: [...t.participants, { ...profile, micOn: true, cameraOn: false, speaking: false, isSelf: true }] } : t);
world.setProps({ tables: joined, profile, activeTableId: "table-window", selectedTableId: null, bubbles: {}, callbacks: { onSelectTable: () => {}, onJoinTable: () => {} } });
const seat = world.getSeatForSelf("table-window");
console.log("layout", world.layout.w, world.layout.h, "seat", seat, "table", world.layout.tables[0]);
for (let i = 0; i < 400; i += 1) {
  world.update(1 / 60);
  if (i % 40 === 0) {
    const p = world.player;
    console.log(i, p.state, p.x.toFixed(2), p.y.toFixed(2), "d", Math.hypot(p.x - seat.x, p.y - seat.y).toFixed(2));
  }
}
console.log("final", world.player.state, world.player.x, world.player.y);
