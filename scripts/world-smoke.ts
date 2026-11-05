/* Simulation smoke test for the café engine with a stubbed DOM. */
const gradient = { addColorStop: () => {} };
const ctx: any = new Proxy(
  {
    canvas: { width: 600, height: 160 },
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  },
  {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => {
      target[prop as string] = value;
      return true;
    },
  },
);

const listeners: Record<string, unknown> = {};
const canvas: any = {
  width: 0,
  height: 0,
  style: {},
  getContext: () => ctx,
  addEventListener: () => {},
  removeEventListener: () => {},
  focus: () => {},
  parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 320 }) },
};

(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).ResizeObserver = class {
  observe() {}
  disconnect() {}
};
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).performance = { now: () => Date.now() };

import { CafeWorld } from "@/lib/world/CafeWorld";
import { SEED_TABLES } from "@/lib/data/tables";
import { getAvatar } from "@/lib/data/avatars";

const profile = { id: "user-1", nickname: "Linh", avatarId: "moss", status: "chill" };
const tables = SEED_TABLES.map((table) => ({ ...table, participants: [...table.participants] }));

const world = new CafeWorld(canvas, {
  tables,
  profile,
  activeTableId: null,
  selectedTableId: null,
  bubbles: {},
  callbacks: { onSelectTable: () => {}, onJoinTable: () => {} },
});

(world as any).start();
// Simulate a walk to the right
(world as any).keys.add("d");
for (let i = 0; i < 60; i += 1) (world as any).update(1 / 60);
(world as any).keys.delete("d");
console.log("player moved to", Math.round((world as any).player.x), Math.round((world as any).player.y));

// Join a table
const joinedTables = tables.map((table) =>
  table.id === "table-window"
    ? {
        ...table,
        participants: [
          ...table.participants,
          { ...profile, micOn: true, cameraOn: false, speaking: true, isSelf: true },
        ],
      }
    : table,
);
world.setProps({
  tables: joinedTables,
  profile,
  activeTableId: "table-window",
  selectedTableId: null,
  bubbles: { "user-1": { text: "hello", at: Date.now() } },
  callbacks: { onSelectTable: () => {}, onJoinTable: () => {} },
});
for (let i = 0; i < 180; i += 1) {
  (world as any).update(1 / 60);
  (world as any).render();
}
const player = (world as any).player;
console.log("player state after join:", player.state, Math.round(player.x), Math.round(player.y));

world.setProps({
  tables: joinedTables,
  profile,
  activeTableId: null,
  selectedTableId: "table-sofa",
  bubbles: {},
  callbacks: { onSelectTable: () => {}, onJoinTable: () => {} },
});
for (let i = 0; i < 30; i += 1) {
  (world as any).update(1 / 60);
  (world as any).render();
}
console.log("player state after leave:", (world as any).player.state);
world.destroy();
console.log("avatar", getAvatar(profile.avatarId).name, "engine destroyed cleanly");
