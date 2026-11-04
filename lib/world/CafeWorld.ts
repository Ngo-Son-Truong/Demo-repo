import type { AvatarLook, CafeTable, UserProfile } from "@/lib/types";
import { getAvatar } from "@/lib/data/avatars";
import { createRng } from "@/lib/background/renderScene";
import { buildLayout, drawProp, drawRoom, drawTable, type WorldLayout } from "@/lib/world/scene";
import {
  drawCharacter,
  drawNameTag,
  drawSpeechBubble,
  roundRect,
  type CharacterState,
} from "@/lib/world/character";

interface WorldCallbacks {
  onSelectTable: (tableId: string | null) => void;
  onJoinTable: (tableId: string) => void;
}

export interface WorldProps {
  tables: CafeTable[];
  profile: UserProfile;
  activeTableId: string | null;
  bubbles: Record<string, { text: string; at: number }>;
  selectedTableId: string | null;
  callbacks: WorldCallbacks;
}

interface Actor {
  x: number;
  y: number;
  facing: 1 | -1;
  state: CharacterState;
  tableId: string | null;
  seatIndex: number;
  walking: boolean;
  target: { x: number; y: number } | null;
  bobPhase: number;
}

interface Wanderer extends Actor {
  id: string;
  nickname: string;
  avatarId: string;
  pauseUntil: number;
  state: CharacterState;
}

const BASE_HEIGHT = 170;

export class CafeWorld {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private props: WorldProps;
  private layout: WorldLayout;
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = true;
  private hoveredId: string | null = null;
  private player: Actor;
  private wanderers: Wanderer[] = [];
  private lastActiveTableId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private renderWidth = 0;
  private renderHeight = 0;
  private drawScaleX = 1;
  private drawScaleY = 1;

  constructor(canvas: HTMLCanvasElement, props: WorldProps) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.props = props;
    this.layout = buildLayout(600, BASE_HEIGHT, props.tables);
    this.player = {
      x: 600 * 0.5,
      y: BASE_HEIGHT * 0.9,
      facing: 1,
      state: "idle",
      tableId: null,
      seatIndex: 0,
      walking: false,
      target: null,
      bobPhase: 0,
    };
    this.lastActiveTableId = props.activeTableId;
    this.initWanderers();
    this.attach();
  }

  private initWanderers() {
    const rng = createRng(91);
    const seeds = [
      { id: "w-1", nickname: "Sương", avatarId: "plum" },
      { id: "w-2", nickname: "Tí", avatarId: "honey" },
    ];
    this.wanderers = seeds.map((seed) => ({
      id: seed.id,
      nickname: seed.nickname,
      avatarId: seed.avatarId,
      x: this.layout.w * (0.3 + rng() * 0.4),
      y: this.layout.h * (0.62 + rng() * 0.28),
      facing: 1,
      state: "idle",
      tableId: null,
      seatIndex: 0,
      walking: false,
      target: null,
      bobPhase: rng() * 200,
      pauseUntil: 0,
    }));
  }

  private attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.onResize();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.resizeObserver?.disconnect();
  }

  setProps(next: WorldProps) {
    const tablesChanged =
      next.tables.length !== this.props.tables.length ||
      next.tables.some((table, i) => {
        const prev = this.props.tables[i];
        return (
          !prev ||
          prev.id !== table.id ||
          prev.participants.length !== table.participants.length ||
          prev.position.x !== table.position.x ||
          prev.position.y !== table.position.y
        );
      });
    this.props = next;
    if (tablesChanged) {
      this.layout = buildLayout(this.layout.w, this.layout.h, next.tables);
    }
    if (next.activeTableId !== this.lastActiveTableId) {
      this.handleTableChange(next.activeTableId);
      this.lastActiveTableId = next.activeTableId;
    }
  }

  private handleTableChange(tableId: string | null) {
    if (tableId) {
      const seat = this.getSeatForSelf(tableId);
      if (seat) {
        this.player.target = { x: seat.x, y: seat.y };
        this.player.state = "walk";
        this.player.tableId = tableId;
        this.player.walking = true;
      }
    } else {
      const previous = this.props.tables.find((table) => table.id === this.lastActiveTableId);
      const tableLayout = this.layout.tables.find((table) => table.id === this.lastActiveTableId);
      if (tableLayout && previous) {
        this.player.x = tableLayout.x;
        this.player.y = Math.min(this.layout.h - 12, tableLayout.y + tableLayout.radius * 1.9);
      }
      this.player.tableId = null;
      this.player.target = null;
      this.player.state = "idle";
      this.player.walking = false;
    }
  }

  private getSeatForSelf(tableId: string) {
    const table = this.props.tables.find((item) => item.id === tableId);
    const tableLayout = this.layout.tables.find((item) => item.id === tableId);
    if (!table || !tableLayout) return null;
    const index = table.participants.findIndex((p) => p.isSelf);
    const seat = tableLayout.seats[index >= 0 ? index : 0];
    return seat ?? null;
  }

  private onResize = () => {
    const host = this.canvas.parentElement ?? this.canvas;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Keep roughly the same logical room width at every breakpoint so the
    // furniture and characters do not balloon on narrow screens.
    const scale = Math.max(0.7, Math.min(3, rect.width / 620));
    const logicalH = Math.round(rect.height / scale);
    const logicalW = Math.round(rect.width / scale);
    // Render at device resolution: the room keeps its logical layout, but every
    // detail (nametags, cups, piano keys…) is painted on the real pixel grid
    // instead of being upscaled from a ~600px-wide bitmap.
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const renderWidth = Math.max(1, Math.round(rect.width * dpr));
    const renderHeight = Math.max(1, Math.round(rect.height * dpr));
    if (
      logicalW === this.lastWidth &&
      logicalH === this.lastHeight &&
      renderWidth === this.renderWidth &&
      renderHeight === this.renderHeight
    ) {
      return;
    }
    const prev = this.layout;
    this.canvas.width = renderWidth;
    this.canvas.height = renderHeight;
    this.canvas.style.imageRendering = "auto";
    this.layout = buildLayout(logicalW, logicalH, this.props.tables);
    this.renderWidth = renderWidth;
    this.renderHeight = renderHeight;
    this.drawScaleX = renderWidth / logicalW;
    this.drawScaleY = renderHeight / logicalH;

    // Keep the player roughly in the same relative place after a resize.
    if (prev.w && prev.h) {
      this.player.x = (this.player.x / prev.w) * logicalW;
      this.player.y = (this.player.y / prev.h) * logicalH;
    }
    this.wanderers.forEach((wanderer) => {
      wanderer.x = (wanderer.x / (prev.w || logicalW)) * logicalW;
      wanderer.y = (wanderer.y / (prev.h || logicalH)) * logicalH;
    });
    this.lastWidth = logicalW;
    this.lastHeight = logicalH;

    if (this.props.activeTableId) {
      const seat = this.getSeatForSelf(this.props.activeTableId);
      if (seat) {
        this.player.x = seat.x;
        this.player.y = seat.y;
      }
    }
  };

  private toLogical(event: PointerEvent | MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.layout.w,
      y: ((event.clientY - rect.top) / rect.height) * this.layout.h,
    };
  }

  private hitTestTable(point: { x: number; y: number }) {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.layout.tables.forEach((table) => {
      const dx = (point.x - table.x) / (table.radius * 1.7);
      const dy = (point.y - table.y) / (table.radius * 1.15);
      const distance = Math.hypot(dx, dy);
      if (distance <= 1 && distance < bestDistance) {
        bestId = table.id;
        bestDistance = distance;
      }
    });
    return bestId;
  }

  private onPointerMove = (event: PointerEvent) => {
    const id = this.hitTestTable(this.toLogical(event));
    this.hoveredId = id;
    this.canvas.style.cursor = id ? "pointer" : "default";
  };

  private onPointerLeave = () => {
    this.hoveredId = null;
    this.canvas.style.cursor = "default";
  };

  private onPointerDown = (event: PointerEvent) => {
    const id = this.hitTestTable(this.toLogical(event));
    this.props.callbacks.onSelectTable(id);
    if (id) this.canvas.focus();
  };

  private onDoubleClick = (event: MouseEvent) => {
    const id = this.hitTestTable(this.toLogical(event));
    if (id) this.props.callbacks.onJoinTable(id);
  };

  private isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable ||
      target.closest("[data-typing-guard='true']") !== null
    );
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }
    if (key === "e" && this.props.selectedTableId) {
      this.props.callbacks.onJoinTable(this.props.selectedTableId);
      return;
    }
    if (key === "escape") {
      this.props.callbacks.onSelectTable(null);
      return;
    }
    this.keys.add(key);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /*  Simulation                                                        */
  /* ------------------------------------------------------------------ */

  private update(dt: number) {
    const { tables, activeTableId } = this.props;
    const activeTable = tables.find((table) => table.id === activeTableId);

    if (activeTable && this.player.tableId === activeTable.id) {
      const seat = this.getSeatForSelf(activeTable.id);
      if (seat) {
        if (this.player.target) {
          const dx = seat.x - this.player.x;
          const dy = seat.y - this.player.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 1.6) {
            this.player.x = seat.x;
            this.player.y = seat.y;
            this.player.target = null;
            this.player.state = "sit";
            this.player.walking = false;
          } else {
            const speed = 95;
            this.player.x += (dx / distance) * speed * dt;
            this.player.y += (dy / distance) * speed * dt;
            this.player.facing = dx >= 0 ? 1 : -1;
            this.player.state = "walk";
            this.player.walking = true;
          }
        } else {
          this.player.state = "sit";
          this.player.walking = false;
          this.player.x = seat.x;
          this.player.y = seat.y;
        }
      }
    } else {
      this.player.tableId = null;
      this.updateManualMovement(dt);
    }

    this.wanderers.forEach((wanderer) => this.updateWanderer(wanderer, dt));
  }

  private updateManualMovement(dt: number) {
    const keys = this.keys;
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    const up = keys.has("w") || keys.has("arrowup");
    const down = keys.has("s") || keys.has("arrowdown");
    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (!moving) {
      if (this.player.state !== "sit") this.player.state = "idle";
      this.player.walking = false;
      return;
    }

    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = 88;
    const nextX = this.player.x + dx * speed * dt;
    const nextY = this.player.y + dy * speed * dt;

    this.player.x = nextX;
    this.player.y = nextY;
    this.player.facing = dx >= 0 ? 1 : -1;
    this.player.state = "walk";
    this.player.walking = true;

    this.resolveCollisions(this.player);
    const bounds = this.layout.bounds;
    this.player.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.player.x));
    this.player.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.player.y));
  }

  private resolveCollisions(actor: Actor) {
    this.layout.tables.forEach((table) => {
      const radius = table.radius * 1.12 + 5;
      const dx = actor.x - table.x;
      const dy = (actor.y - table.y) / 0.72;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < radius) {
        const push = (radius - distance) / distance;
        actor.x += dx * push;
        actor.y += dy * push * 0.72;
      }
    });
  }

  private updateWanderer(wanderer: Wanderer, dt: number) {
    if (this.time < wanderer.pauseUntil) {
      wanderer.state = wanderer.state === "sit" ? "sit" : "idle";
      wanderer.walking = false;
      return;
    }
    if (!wanderer.target) {
      const bounds = this.layout.bounds;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY - 6);
        const blocked = this.layout.tables.some((table) => {
          const dx = (x - table.x) / (table.radius * 1.9);
          const dy = (y - table.y) / (table.radius * 1.3);
          return Math.hypot(dx, dy) < 1;
        });
        if (!blocked) {
          wanderer.target = { x, y };
          break;
        }
      }
      if (!wanderer.target) wanderer.pauseUntil = this.time + 2;
      return;
    }
    const dx = wanderer.target.x - wanderer.x;
    const dy = wanderer.target.y - wanderer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) {
      wanderer.target = null;
      wanderer.pauseUntil = this.time + 2 + Math.random() * 4;
      wanderer.state = "idle";
      wanderer.walking = false;
      return;
    }
    const speed = 26;
    wanderer.x += (dx / distance) * speed * dt;
    wanderer.y += (dy / distance) * speed * dt;
    wanderer.facing = dx >= 0 ? 1 : -1;
    wanderer.walking = true;
    wanderer.state = "walk";
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                         */
  /* ------------------------------------------------------------------ */

  private render() {
    const ctx = this.ctx;
    const { layout, props } = this;
    ctx.setTransform(this.drawScaleX, 0, 0, this.drawScaleY, 0, 0);
    ctx.clearRect(0, 0, layout.w, layout.h);
    drawRoom(ctx, layout, this.time, true);

    type Job = { y: number; draw: () => void };
    const jobs: Job[] = [];

    layout.props.forEach((prop) => {
      if (prop.kind === "rug") {
        jobs.push({ y: -100, draw: () => drawProp(ctx, prop, layout) });
      } else if (prop.kind === "shelf") {
        jobs.push({ y: prop.y - 20, draw: () => drawProp(ctx, prop, layout) });
      } else {
        jobs.push({ y: prop.y, draw: () => drawProp(ctx, prop, layout) });
      }
    });

    layout.tables.forEach((tableLayout) => {
      const table = props.tables.find((item) => item.id === tableLayout.id);
      if (!table) return;
      jobs.push({
        y: tableLayout.y + tableLayout.radius * 0.35,
        draw: () =>
          drawTable(ctx, tableLayout, table, this.time, {
            hovered: this.hoveredId === table.id,
            selected: props.selectedTableId === table.id,
            joined: props.activeTableId === table.id,
          }),
      });
    });

    const selfId = props.profile.id;
    const tags: Array<() => void> = [];

    // Seated participants
    layout.tables.forEach((tableLayout) => {
      const table = props.tables.find((item) => item.id === tableLayout.id);
      if (!table) return;
      const focused =
        props.activeTableId === tableLayout.id || props.selectedTableId === tableLayout.id;
      table.participants.forEach((participant, index) => {
        if (participant.isSelf || participant.id === selfId) return;
        const seat = tableLayout.seats[index];
        if (!seat) return;
        const look = getAvatar(participant.avatarId);
        const phase = participant.id
          .split("")
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const speaking = participant.speaking;
        const state: CharacterState = speaking
          ? "talk"
          : Math.sin(this.time * 0.5 + phase) > 0.94
            ? "wave"
            : "sit";
        jobs.push({
          y: seat.y + 2,
          draw: () =>
            drawCharacter(ctx, seat.x, seat.y, look, {
              state,
              time: this.time + phase,
              facing: seat.x < tableLayout.x ? 1 : -1,
              speaking,
              scale: layout.h / 170,
            }),
        });
        const seatAngle = (index / Math.max(1, tableLayout.seats.length)) * Math.PI * 2;
        const fontScale = layout.h / 170;
        const tagLift = (29 + (index % 4) * 7.5) * fontScale;
        const tagPad = 16 * fontScale + 10;
        const tagX = Math.max(
          tagPad,
          Math.min(layout.w - tagPad, seat.x + Math.cos(seatAngle) * 20 * fontScale),
        );
        const showTag = focused || speaking || index === 0;
        tags.push(() => {
          if (showTag) {
            drawNameTag(ctx, tagX, seat.y - tagLift, participant.nickname, {
              speaking,
              isHost: participant.isHost,
              muted: !participant.micOn,
              fontScale: layout.h / 170,
            });
          }
          const bubble = props.bubbles[participant.id];
          if (bubble && this.time * 1000 - bubble.at < 6500) {
            drawSpeechBubble(
              ctx,
              tagX,
              seat.y - tagLift - 10 * (layout.h / 170),
              bubble.text,
              layout.h / 170,
            );
          }
        });
      });
    });

    // Wanderers
    this.wanderers.forEach((wanderer) => {
      const look = getAvatar(wanderer.avatarId);
      jobs.push({
        y: wanderer.y,
        draw: () =>
          drawCharacter(ctx, wanderer.x, wanderer.y, look, {
            state: wanderer.state,
            time: this.time + wanderer.bobPhase,
            facing: wanderer.facing,
            scale: layout.h / 170,
            dimmed: true,
          }),
      });
    });

    // Player
    const playerLook = getAvatar(props.profile.avatarId);
    jobs.push({
      y: this.player.y,
      draw: () =>
        drawCharacter(ctx, this.player.x, this.player.y, playerLook, {
          state: this.player.state,
          time: this.time,
          facing: this.player.facing,
          scale: layout.h / 170,
        }),
    });
    tags.push(() => {
      drawNameTag(
        ctx,
        this.player.x,
        this.player.y - 30 * (layout.h / 170),
        props.profile.nickname,
        {
          self: true,
          fontScale: layout.h / 170,
        },
      );
      const bubble = props.bubbles[props.profile.id];
      if (bubble && this.time * 1000 - bubble.at < 6500) {
        drawSpeechBubble(
          ctx,
          this.player.x,
          this.player.y - 40 * (layout.h / 170),
          bubble.text,
          layout.h / 170,
        );
      }
    });

    jobs.sort((a, b) => a.y - b.y);
    jobs.forEach((job) => job.draw());
    tags.forEach((draw) => draw());

    // Soft vignette + warm light wash keeps the room feeling like evening.
    const vignette = ctx.createRadialGradient(
      layout.w / 2,
      layout.h / 2,
      layout.h * 0.2,
      layout.w / 2,
      layout.h / 2,
      layout.w * 0.75,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(20, 12, 8, 0.24)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, layout.w, layout.h);

    // Hint marker over the table under the cursor
    if (this.hoveredId) {
      const table = layout.tables.find((item) => item.id === this.hoveredId);
      const data = props.tables.find((item) => item.id === this.hoveredId);
      if (table && data) {
        const free = data.capacity - data.participants.length;
        const label = free > 0 ? `${data.name} · ${free} chỗ` : `${data.name} · đã đầy`;
        ctx.font = `${Math.max(6, Math.round(6.5 * (layout.h / 170)))}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        const width = ctx.measureText(label).width + 10;
        const boxY = table.y - table.radius - 14;
        ctx.fillStyle = "rgba(20, 16, 14, 0.85)";
        roundRect(ctx, table.x - width / 2, boxY - 9, width, 13, 3);
        ctx.fill();
        ctx.fillStyle = "#FFD79A";
        ctx.textBaseline = "middle";
        ctx.fillText(label, table.x, boxY - 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
    }
  }
}
