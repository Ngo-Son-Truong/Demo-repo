import type { CafeTable } from "@/lib/types";

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

export interface SeatLayout {
  x: number;
  y: number;
  angle: number;
}

export interface TableLayout {
  id: string;
  x: number;
  y: number;
  radius: number;
  seats: SeatLayout[];
}

export interface PropLayout {
  id: string;
  kind: "sofa" | "plant" | "shelf" | "cat" | "speaker" | "rug" | "piano";
  x: number;
  y: number;
  scale: number;
}

export interface WorldLayout {
  w: number;
  h: number;
  wallH: number;
  floorY: number;
  tables: TableLayout[];
  props: PropLayout[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildLayout(w: number, h: number, tables: CafeTable[]): WorldLayout {
  const wallH = Math.round(h * 0.28);
  const floorY = wallH;

  const tableLayouts: TableLayout[] = tables.map((table) => {
    const radius = h * (0.085 + table.capacity * 0.0065);
    const x = clamp(table.position.x * w, radius * 1.8 + 6, w - radius * 1.8 - 6);
    const y = floorY + table.position.y * (h - floorY);
    const ringX = radius * 1.4;
    const ringY = radius * 0.82;
    const startAngle =
      table.capacity % 4 === 0 ? Math.PI / 4 : table.capacity % 2 === 0 ? Math.PI / 2 : 0;
    const seats: SeatLayout[] = Array.from({ length: table.capacity }, (_, index) => {
      const angle = startAngle + (index / table.capacity) * Math.PI * 2;
      return {
        x: x + Math.cos(angle) * ringX,
        y: y + Math.sin(angle) * ringY,
        angle,
      };
    });
    return { id: table.id, x, y, radius, seats };
  });

  const props: PropLayout[] = [
    { id: "rug", kind: "rug", x: w * 0.5, y: floorY + (h - floorY) * 0.86, scale: 1 },
    { id: "sofa", kind: "sofa", x: w * 0.09, y: floorY + (h - floorY) * 0.2, scale: h / 160 },
    { id: "shelf", kind: "shelf", x: w * 0.64, y: wallH - 3, scale: h / 175 },
    { id: "plant-1", kind: "plant", x: w * 0.025, y: h - 10, scale: h / 150 },
    { id: "plant-2", kind: "plant", x: w * 0.975, y: h - 14, scale: h / 165 },
    { id: "cat", kind: "cat", x: w * 0.145, y: floorY + (h - floorY) * 0.2, scale: h / 160 },
    { id: "speaker", kind: "speaker", x: w * 0.86, y: wallH + 5, scale: h / 160 },
    { id: "piano", kind: "piano", x: w * 0.47, y: wallH + 6, scale: h / 160 },
  ];

  return {
    w,
    h,
    wallH,
    floorY,
    tables: tableLayouts,
    props,
    bounds: {
      minX: 10,
      maxX: w - 10,
      minY: floorY + 16,
      maxY: h - 6,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Room rendering                                                            */
/* -------------------------------------------------------------------------- */

export function drawRoom(
  ctx: CanvasRenderingContext2D,
  layout: WorldLayout,
  time: number,
  night: boolean,
) {
  const { w, h, wallH } = layout;
  ctx.imageSmoothingEnabled = false;

  // Wall
  const wallGrad = ctx.createLinearGradient(0, 0, 0, wallH);
  wallGrad.addColorStop(0, night ? "#2B211C" : "#4A372C");
  wallGrad.addColorStop(1, night ? "#3D2E25" : "#5C4435");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, w, wallH);

  // Wallpaper stripes
  ctx.globalAlpha = 0.07;
  for (let x = 0; x < w; x += 9) {
    ctx.fillStyle = "#F5EBDD";
    ctx.fillRect(x, 0, 3, wallH);
  }
  ctx.globalAlpha = 1;

  // Windows along the wall
  const windows = [0.2, 0.48, 0.76];
  windows.forEach((fx, index) => {
    const ww = w * 0.16;
    const wh = wallH * 0.52;
    const wx = w * fx - ww / 2;
    const wy = wallH * 0.12;
    ctx.fillStyle = "#1A1512";
    ctx.fillRect(Math.round(wx - 3), Math.round(wy - 3), Math.round(ww + 6), Math.round(wh + 6));
    const glass = ctx.createLinearGradient(0, wy, 0, wy + wh);
    glass.addColorStop(0, night ? "#243449" : "#A8C6CE");
    glass.addColorStop(1, night ? "#4E5A63" : "#E8DCC4");
    ctx.fillStyle = glass;
    ctx.fillRect(Math.round(wx), Math.round(wy), Math.round(ww), Math.round(wh));
    // City lights
    if (night) {
      for (let i = 0; i < 14; i += 1) {
        const lx = wx + ((i * 37 + index * 11) % ww);
        const ly = wy + wh * 0.55 + ((i * 19) % (wh * 0.4));
        ctx.globalAlpha = 0.3 + ((i * 13) % 40) / 100;
        ctx.fillStyle = i % 4 === 0 ? "#9FD4E6" : "#FFC873";
        ctx.fillRect(Math.round(lx), Math.round(ly), 2, 2);
      }
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i < 5; i += 1) {
        const cx = wx + 6 + ((i * 23) % Math.max(8, ww - 20));
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#FBF5EA";
        ctx.beginPath();
        ctx.ellipse(cx, wy + wh * 0.25 + (i % 3) * 6, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Mullions
    ctx.fillStyle = "#2A201B";
    ctx.fillRect(Math.round(wx + ww / 2 - 1), Math.round(wy), 2, Math.round(wh));
    ctx.fillRect(Math.round(wx), Math.round(wy + wh / 2 - 1), Math.round(ww), 2);
    // Sill
    ctx.fillStyle = "#6A4B38";
    ctx.fillRect(Math.round(wx - 5), Math.round(wy + wh), Math.round(ww + 10), 4);
  });

  // Framed print and a small clock on the wall
  const artX = w * 0.55;
  const artY = wallH * 0.24;
  rect(ctx, artX - 15, artY - 10, 30, 21, "#6A4A35");
  rect(ctx, artX - 13, artY - 8, 26, 17, "#EFE2CE");
  ctx.fillStyle = gradient(ctx, 0, artY - 4, 0, artY + 7, [
    [0, "#E58A5B"],
    [1, "#5C4A6E"],
  ]);
  ctx.fillRect(px(artX - 11), px(artY - 6), 22, 13);
  rect(ctx, artX - 4, artY - 1, 5, 5, "#FFD79A");
  rect(ctx, artX - 11, artY + 3, 22, 4, "#4A3750");

  const clockX = w * 0.92;
  const clockY = wallH * 0.28;
  ctx.fillStyle = "#EFE2CE";
  ctx.beginPath();
  ctx.arc(clockX, clockY, Math.max(6, h * 0.045), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5A3E2C";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(clockX, clockY, Math.max(6, h * 0.045), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#3A2A20";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY);
  ctx.lineTo(clockX, clockY - h * 0.026);
  ctx.moveTo(clockX, clockY);
  ctx.lineTo(clockX + h * 0.018, clockY + h * 0.008);
  ctx.stroke();

  // Plants on the window sills
  [0.2, 0.76].forEach((fx, index) => {
    const pxo = w * fx + w * 0.05;
    const pyo = wallH * 0.64;
    rect(ctx, pxo - 4, pyo - 5, 8, 6, "#8A5B3D");
    for (let i = 0; i < 4; i += 1) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.5;
      ctx.strokeStyle = i % 2 ? "#4F7A4C" : "#3E6540";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pxo, pyo - 5);
      ctx.quadraticCurveTo(
        pxo + Math.cos(a) * 5,
        pyo - 5 + Math.sin(a) * 6,
        pxo + Math.cos(a) * 9,
        pyo - 5 + Math.sin(a) * 10,
      );
      ctx.stroke();
    }
  });

  // Hanging pothos from the ceiling
  const hpX = w * 0.085;
  rect(ctx, hpX - 1, 0, 2, h * 0.1, "#2B1F18");
  rect(ctx, hpX - 5, h * 0.1, 10, 7, "#A87250");
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = "#3E6540";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hpX + (i - 2) * 0.5, h * 0.17);
    ctx.quadraticCurveTo(hpX + (i - 2) * 3, h * 0.22, hpX + (i - 2) * 5, h * 0.27 + (i % 2) * 3);
    ctx.stroke();
    ctx.fillStyle = "#4F7A4C";
    ctx.beginPath();
    ctx.ellipse(hpX + (i - 2) * 5, h * 0.27 + (i % 2) * 3, 2.5, 1.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Skirting board
  ctx.fillStyle = night ? "#523A2C" : "#6E4F3A";
  ctx.fillRect(0, wallH - 6, w, 6);
  ctx.fillStyle = night ? "#6B4B36" : "#8A6549";
  ctx.fillRect(0, wallH - 6, w, 2);

  // Neon sign
  const signW = Math.max(46, w * 0.098);
  const signH = Math.max(15, h * 0.082);
  const signX = w * 0.355;
  const signY = wallH * 0.14;
  const halo = ctx.createRadialGradient(signX, signY + signH / 2, 0, signX, signY + signH / 2, signW * 0.62);
  halo.addColorStop(0, "rgba(7,153,173,0.2)");
  halo.addColorStop(1, "rgba(7,153,173,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(signX - signW, signY - signH, signW * 2, signH * 3);

  ctx.fillStyle = "#100D0B";
  rr(ctx, signX - signW / 2, signY, signW, signH, Math.min(3, signH / 4));
  ctx.fill();
  ctx.strokeStyle = "rgba(140,236,229,0.22)";
  ctx.lineWidth = 1;
  rr(ctx, Math.round(signX - signW / 2) + 0.5, Math.round(signY) + 0.5, Math.round(signW) - 1, Math.round(signH) - 1, 2);
  ctx.stroke();

  ctx.font = `${Math.max(7, Math.round(signH * 0.62))}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(7,153,173,0.95)";
  ctx.shadowBlur = Math.max(6, signH * 0.7);
  ctx.fillStyle = "rgba(120,226,220,0.55)";
  ctx.fillText("chill", signX, signY + signH / 2 + 0.5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#C6F7F1";
  ctx.fillText("chill", signX, signY + signH / 2 + 0.5);

  // tiny neon underline
  ctx.fillStyle = "rgba(198,247,241,0.55)";
  ctx.fillRect(Math.round(signX - signW * 0.22), Math.round(signY + signH - 4), Math.round(signW * 0.44), 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Hanging pendant lamps
  [0.12, 0.42, 0.62, 0.9].forEach((fx, index) => {
    const lx = w * fx;
    const cord = wallH * (0.1 + (index % 2) * 0.06);
    ctx.fillStyle = "#1C1512";
    ctx.fillRect(Math.round(lx), 0, 1, Math.round(cord));
    const shadeW = Math.max(8, h * 0.075);
    const shadeH = Math.max(4, h * 0.04);
    const shadeY = cord;
    ctx.fillStyle = "#3B2A20";
    ctx.beginPath();
    ctx.moveTo(lx - shadeW / 2, shadeY + shadeH);
    ctx.lineTo(lx - shadeW / 4, shadeY);
    ctx.lineTo(lx + shadeW / 4, shadeY);
    ctx.lineTo(lx + shadeW / 2, shadeY + shadeH);
    ctx.closePath();
    ctx.fill();
    const flicker = 0.9 + Math.sin(time * 2.4 + index * 1.7) * 0.06;
    ctx.fillStyle = "#FFD79A";
    ctx.fillRect(Math.round(lx - shadeW / 4), Math.round(shadeY + shadeH), Math.round(shadeW / 2), 2);
    const glow = ctx.createRadialGradient(lx, shadeY + shadeH + 4, 0, lx, shadeY + shadeH + 4, h * 0.32);
    glow.addColorStop(0, `rgba(255, 189, 89, ${0.22 * flicker})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lx - h * 0.34, shadeY, h * 0.68, h * 0.5);
  });

  // Floor
  const floorGrad = ctx.createLinearGradient(0, wallH, 0, h);
  floorGrad.addColorStop(0, night ? "#5B3F2D" : "#8A6344");
  floorGrad.addColorStop(1, night ? "#3E2A1E" : "#6E4E35");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, wallH, w, h - wallH);

  // Planks
  const plankH = Math.max(4, (h - wallH) / 14);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 16; i += 1) {
    const y = wallH + i * plankH;
    ctx.fillStyle = i % 2 === 0 ? "#2B1C12" : "#D9B48C";
    ctx.fillRect(0, Math.round(y), w, 1);
  }
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 24; i += 1) {
    const x = ((i * 137) % 100) / 100 * w;
    ctx.fillStyle = "#2B1C12";
    ctx.fillRect(Math.round(x), wallH, 1, h - wallH);
  }
  ctx.globalAlpha = 1;

  // Warm light pools
  [0.12, 0.42, 0.62, 0.9].forEach((fx) => {
    const g = ctx.createRadialGradient(w * fx, wallH + 14, 0, w * fx, wallH + 14, h * 0.42);
    g.addColorStop(0, "rgba(255, 200, 120, 0.16)");
    g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(w * fx - h * 0.45, wallH, h * 0.9, h);
  });
}

export function drawProp(ctx: CanvasRenderingContext2D, prop: PropLayout, layout: WorldLayout) {
  const s = prop.scale;
  const { x, y } = prop;
  switch (prop.kind) {
    case "rug": {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#0F6267";
      ctx.beginPath();
      ctx.ellipse(x, y, layout.w * 0.22, (layout.h - layout.wallH) * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#13787D";
      ctx.beginPath();
      ctx.ellipse(x, y, layout.w * 0.17, (layout.h - layout.wallH) * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#FFBD59";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.ellipse(x, y, layout.w * 0.19, (layout.h - layout.wallH) * 0.19, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      break;
    }
    case "sofa": {
      const w = 50 * s;
      const h = 22 * s;
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 4 * s, w * 0.55, 5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // backrest
      ctx.fillStyle = "#6E4534";
      rr(ctx, x, y - h, w, h * 0.62, 4);
      ctx.fill();
      ctx.fillStyle = "#84543F";
      rr(ctx, x + 2, y - h + 2, w - 4, h * 0.38, 3);
      ctx.fill();
      // back cushions
      ctx.fillStyle = "#9A6249";
      rr(ctx, x + 4, y - h + 4, w * 0.44, h * 0.34, 3);
      ctx.fill();
      rr(ctx, x + w * 0.53, y - h + 4, w * 0.43, h * 0.34, 3);
      ctx.fill();
      // throw pillow
      ctx.fillStyle = "#FFBD59";
      rr(ctx, x + w * 0.12, y - h + 6, w * 0.17, h * 0.26, 2);
      ctx.fill();
      // seat
      ctx.fillStyle = "#965F49";
      rr(ctx, x - 2, y - h * 0.52, w + 4, h * 0.5, 3);
      ctx.fill();
      ctx.fillStyle = "#AC7155";
      rr(ctx, x - 1, y - h * 0.5, (w + 2) / 2 - 2, h * 0.4, 3);
      ctx.fill();
      rr(ctx, x + (w + 2) / 2 + 1, y - h * 0.5, (w + 2) / 2 - 2, h * 0.4, 3);
      ctx.fill();
      // arms
      ctx.fillStyle = "#5E3B2B";
      rr(ctx, x - 5, y - h * 0.82, 7, h * 0.8, 3);
      ctx.fill();
      rr(ctx, x + w - 2, y - h * 0.82, 7, h * 0.8, 3);
      ctx.fill();
      // legs
      ctx.fillStyle = "#3A281C";
      ctx.fillRect(x + 3, y - 2, 3, 5 * s);
      ctx.fillRect(x + w - 6, y - 2, 3, 5 * s);
      break;
    }
    case "shelf": {
      const w = 30 * s;
      const h = 24 * s;
      // brackets + planks
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x - w / 2 + 2, y - 2, w, 3);
      [0, 1, 2].forEach((level) => {
        const yy = y - h + level * (h / 3);
        ctx.fillStyle = "#7A5238";
        ctx.fillRect(x - w / 2, yy, w, 2.5);
        ctx.fillStyle = "#5A3C2A";
        ctx.fillRect(x - w / 2 + 2, yy + 2.5, 2, 3);
        ctx.fillRect(x + w / 2 - 4, yy + 2.5, 2, 3);
      });
      const bookColors = ["#FFBD59", "#0799AD", "#CBD5E1", "#E58C7A", "#7E9C6B"];
      for (let i = 0; i < 12; i += 1) {
        const bx = x - w / 2 + 3 + (i % 8) * 3.2;
        const by = y - h + Math.floor(i / 8) * (h / 3);
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(Math.round(bx), Math.round(by - (i % 3 === 0 ? 7 : 6)), 2.5, i % 3 === 0 ? 7 : 6);
      }
      // small jar on the top shelf
      ctx.fillStyle = "#D9C9A8";
      ctx.fillRect(x + w * 0.24, y - h - 4, 4, 4);
      ctx.fillStyle = "#4F7A4C";
      ctx.fillRect(x + w * 0.24 + 1, y - h - 7, 2, 3);
      break;
    }
    case "plant": {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 9 * s, 3 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // pot
      ctx.fillStyle = "#8A5B3D";
      ctx.beginPath();
      ctx.moveTo(x - 6 * s, y - 9 * s);
      ctx.lineTo(x + 6 * s, y - 9 * s);
      ctx.lineTo(x + 4 * s, y);
      ctx.lineTo(x - 4 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#A87250";
      ctx.fillRect(x - 7 * s, y - 10 * s, 14 * s, 2 * s);
      // leaves
      const leaves = 7;
      for (let i = 0; i < leaves; i += 1) {
        const angle = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.34;
        const len = (12 + (i % 3) * 5) * s;
        ctx.strokeStyle = i % 2 === 0 ? "#4F7A4C" : "#3E6540";
        ctx.lineWidth = Math.max(1.5, 2 * s);
        ctx.beginPath();
        ctx.moveTo(x, y - 9 * s);
        ctx.quadraticCurveTo(
          x + Math.cos(angle) * len * 0.7,
          y - 9 * s + Math.sin(angle) * len * 0.7,
          x + Math.cos(angle) * len,
          y - 9 * s + Math.sin(angle) * len,
        );
        ctx.stroke();
      }
      break;
    }
    case "cat": {
      ctx.fillStyle = "#E9B96B";
      ctx.beginPath();
      ctx.ellipse(x, y - 8 * s, 9 * s, 4.6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 8 * s, y - 9 * s, 3.6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 10 * s, y - 12 * s);
      ctx.lineTo(x - 9 * s, y - 15 * s);
      ctx.lineTo(x - 7 * s, y - 12 * s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 7 * s, y - 12 * s);
      ctx.lineTo(x - 6 * s, y - 15 * s);
      ctx.lineTo(x - 4 * s, y - 11.5 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "speaker": {
      const w = 12 * s;
      const h = 15 * s;
      ctx.fillStyle = "#4A3527";
      ctx.fillRect(x - w / 2, y - h, w, h);
      ctx.fillStyle = "#2A201A";
      ctx.fillRect(x - w / 2 + 2, y - h + 2, w - 4, h * 0.5);
      ctx.fillStyle = "#7A5A42";
      ctx.beginPath();
      ctx.arc(x, y - h * 0.45, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3A2A20";
      ctx.fillRect(x - w / 2, y, w, 2);
      break;
    }
    case "piano": {
      const w = 62 * s;
      const h = 24 * s;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 2, w * 0.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // body
      ctx.fillStyle = "#3A2A22";
      rr(ctx, x, y - h, w, h, 3);
      ctx.fill();
      ctx.fillStyle = "#4E372C";
      rr(ctx, x + 2, y - h + 2, w - 4, h * 0.45, 2);
      ctx.fill();
      // sheet music
      ctx.fillStyle = "#EFE2CE";
      ctx.fillRect(x + w * 0.36, y - h - 5, w * 0.28, 7);
      ctx.fillStyle = "#8A7A60";
      for (let i = 0; i < 3; i += 1) ctx.fillRect(x + w * 0.38, y - h - 3.5 + i * 1.6, w * 0.24, 0.6);
      // keys
      ctx.fillStyle = "#F5EBDD";
      ctx.fillRect(x + w * 0.12, y - h * 0.5, w * 0.76, h * 0.22);
      ctx.fillStyle = "#252525";
      for (let i = 0; i < 14; i += 1) {
        ctx.fillRect(x + w * 0.13 + i * (w * 0.054), y - h * 0.5, 1.4, h * 0.13);
      }
      // music stand + legs
      ctx.fillStyle = "#2B1F18";
      ctx.fillRect(x + 3, y - 1, 3, 5 * s);
      ctx.fillRect(x + w - 6, y - 1, 3, 5 * s);
      break;
    }
    default:
      break;
  }
}

export function drawTable(
  ctx: CanvasRenderingContext2D,
  table: TableLayout,
  tableData: CafeTable,
  time: number,
  state: { hovered: boolean; selected: boolean; joined: boolean },
) {
  const { x, y, radius: r } = table;
  const scale = r / 18;
  const night = true;

  // Chairs first (behind table)
  table.seats.forEach((seat, index) => {
    const occupied = index < tableData.participants.length;
    if (occupied) return; // characters are drawn on top of their chair
    drawChair(ctx, seat.x, seat.y, seat.angle, r * 0.42);
  });

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 1.06, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rug under marked table
  if (state.selected || state.joined) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = state.joined ? "#FFBD59" : "#F5EBDD";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.25, r * 1.7, r * 0.85, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Pedestal
  ctx.fillStyle = "#3F2C1F";
  ctx.fillRect(Math.round(x - r * 0.16), Math.round(y), Math.round(r * 0.32), Math.round(r * 0.55));
  ctx.fillStyle = "#2F2016";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.6, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Table top
  const top = ctx.createLinearGradient(0, y - r * 0.2, 0, y + r * 0.45);
  top.addColorStop(0, "#A9764E");
  top.addColorStop(1, "#7A5136");
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5C3B27";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#C89A6C";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.06, r * 0.78, r * 0.36, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Table items: candle, cups, a little vase and a plate of snacks
  drawCandle(ctx, x + r * 0.16, y - r * 0.06, scale, time);
  const cups = Math.min(4, Math.max(1, tableData.participants.length));
  for (let i = 0; i < cups; i += 1) {
    const angle = -0.5 + i * 1.6;
    const cx = x + Math.cos(angle) * r * 0.58;
    const cy = y + Math.sin(angle) * r * 0.26;
    drawCup(ctx, cx, cy, scale * 0.9);
  }
  if (tableData.participants.length > 2) {
    drawSnackPlate(ctx, x - r * 0.5, y + r * 0.06, scale);
  }
  if (tableData.capacity - tableData.participants.length > 0) {
    drawVase(ctx, x - r * 0.28, y - r * 0.16, scale);
  }
  if (tableData.visibility === "private") {
    drawLockBadge(ctx, x - r * 0.55, y - r * 0.15, scale * 0.85);
  }
  if (tableData.capacity - tableData.participants.length === 0) {
    drawFullBadge(ctx, x + r * 0.6, y - r * 0.2, scale * 0.85);
  }

  // Hover / selection ring
  if (state.hovered || state.selected) {
    ctx.globalAlpha = state.selected ? 0.95 : 0.5;
    ctx.strokeStyle = state.selected ? "#FFBD59" : "#F5EBDD";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.1, r * 1.22, r * 0.64, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Breathing glow for the joined table
  if (state.joined) {
    const pulse = 0.16 + Math.sin(time * 2) * 0.05;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, `rgba(255, 189, 89, ${pulse})`);
    g.addColorStop(1, "rgba(255,189,89,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 1.9, y - r * 1.4, r * 3.8, r * 2.8);
  }

  if (!night) return;
}

function rr(
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

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, s: number) {
  const front = Math.sin(angle) > 0.15;

  // contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.55, s * 1.15, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  const backrest = (top: number) => {
    // wooden frame
    ctx.fillStyle = "#5C3E2A";
    rr(ctx, x - s * 1.05, top, s * 2.1, s * 0.66, 2);
    ctx.fill();
    // top rail highlight
    ctx.fillStyle = "#7E5638";
    rr(ctx, x - s * 1.05, top, s * 2.1, s * 0.22, 2);
    ctx.fill();
    // vertical slats
    ctx.fillStyle = "#4A3020";
    ctx.fillRect(Math.round(x - s * 0.42), Math.round(top + s * 0.22), Math.max(1, s * 0.24), s * 0.42);
    ctx.fillRect(Math.round(x + s * 0.2), Math.round(top + s * 0.22), Math.max(1, s * 0.24), s * 0.42);
  };

  if (!front) backrest(y - s * 1.12);

  // legs
  ctx.fillStyle = "#3A281C";
  ctx.fillRect(Math.round(x - s * 0.82), Math.round(y + s * 0.18), Math.max(1, s * 0.22), Math.max(1, s * 0.5));
  ctx.fillRect(Math.round(x + s * 0.6), Math.round(y + s * 0.18), Math.max(1, s * 0.22), Math.max(1, s * 0.5));

  // seat
  ctx.fillStyle = "#8A5F43";
  rr(ctx, x - s, y - s * 0.34, s * 2, s * 0.62, 2);
  ctx.fill();
  ctx.fillStyle = "#A5764F";
  rr(ctx, x - s * 0.92, y - s * 0.34, s * 1.84, s * 0.2, 2);
  ctx.fill();
  // seat cushion
  ctx.fillStyle = "#C97F52";
  rr(ctx, x - s * 0.78, y - s * 0.3, s * 1.56, s * 0.4, 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#F0C08C";
  ctx.fillRect(Math.round(x - s * 0.6), Math.round(y - s * 0.24), Math.round(s * 0.9), Math.max(1, s * 0.08));
  ctx.globalAlpha = 1;

  if (front) backrest(y + s * 0.36);
}

function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number) {
  ctx.fillStyle = "#E8D8BE";
  ctx.fillRect(Math.round(x - 1.5 * scale), Math.round(y - 5 * scale), Math.round(3 * scale), Math.round(5 * scale));
  const flicker = 0.7 + Math.sin(time * 6) * 0.3;
  ctx.fillStyle = "#FFD79A";
  ctx.fillRect(Math.round(x - 0.5 * scale), Math.round(y - 8 * scale), Math.round(1.5 * scale), Math.round(2.5 * scale));
  const glow = ctx.createRadialGradient(x, y - 7 * scale, 0, x, y - 7 * scale, 14 * scale);
  glow.addColorStop(0, `rgba(255, 189, 89, ${0.28 * flicker})`);
  glow.addColorStop(1, "rgba(255,189,89,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 15 * scale, y - 22 * scale, 30 * scale, 30 * scale);
}

function drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  // saucer
  ctx.fillStyle = "#E3D3B8";
  ctx.beginPath();
  ctx.ellipse(x, y + 0.4 * scale, 3.2 * scale, 1.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // cup
  ctx.fillStyle = "#F7EFE0";
  ctx.fillRect(Math.round(x - 1.8 * scale), Math.round(y - 3 * scale), Math.round(3.6 * scale), Math.round(3 * scale));
  ctx.fillStyle = "#E3D3B8";
  ctx.fillRect(Math.round(x - 1.8 * scale), Math.round(y - 3 * scale), Math.round(3.6 * scale), Math.max(1, Math.round(0.8 * scale)));
  // handle
  ctx.fillStyle = "#F7EFE0";
  ctx.fillRect(Math.round(x + 1.6 * scale), Math.round(y - 2 * scale), Math.max(1, Math.round(1.2 * scale)), Math.max(1, Math.round(1.4 * scale)));
  // coffee surface
  ctx.fillStyle = "#5A3A28";
  ctx.fillRect(Math.round(x - 1.2 * scale), Math.round(y - 2.6 * scale), Math.round(2.4 * scale), Math.max(1, Math.round(0.6 * scale)));
}

function drawSnackPlate(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "#EFE2CE";
  ctx.beginPath();
  ctx.ellipse(x, y, 5 * scale, 2.4 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#C9A36F";
  ctx.beginPath();
  ctx.ellipse(x - 1.6 * scale, y - 0.7 * scale, 1.8 * scale, 1.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 1.8 * scale, y - 0.3 * scale, 1.6 * scale, 1.1 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawVase(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "#0799AD";
  ctx.fillRect(Math.round(x - 1.6 * scale), Math.round(y - 4 * scale), Math.round(3.2 * scale), Math.round(4 * scale));
  ctx.fillStyle = "#0A7686";
  ctx.fillRect(Math.round(x - 1.6 * scale), Math.round(y - 4 * scale), Math.round(3.2 * scale), Math.max(1, Math.round(scale)));
  ctx.strokeStyle = "#4F7A4C";
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(x, y - 4 * scale);
  ctx.lineTo(x + 0.5 * scale, y - 7 * scale);
  ctx.moveTo(x, y - 4 * scale);
  ctx.lineTo(x - 2 * scale, y - 6.5 * scale);
  ctx.stroke();
  ctx.fillStyle = "#E58C7A";
  ctx.fillRect(Math.round(x + 0.2 * scale), Math.round(y - 8 * scale), Math.max(1, Math.round(1.6 * scale)), Math.max(1, Math.round(1.6 * scale)));
  ctx.fillStyle = "#FFBD59";
  ctx.fillRect(Math.round(x - 2.6 * scale), Math.round(y - 7.5 * scale), Math.max(1, Math.round(1.4 * scale)), Math.max(1, Math.round(1.4 * scale)));
}

function drawLockBadge(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const s = Math.max(1, scale);
  ctx.fillStyle = "#FFBD59";
  ctx.fillRect(Math.round(x - 3 * s), Math.round(y - 1 * s), Math.round(6 * s), Math.round(5 * s));
  ctx.strokeStyle = "#FFBD59";
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.arc(x, y - s, 1.6 * s, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#5A3C1E";
  ctx.fillRect(Math.round(x - 0.7 * s), Math.round(y + 0.8 * s), Math.max(1, Math.round(1.2 * s)), Math.round(1.8 * s));
}

function drawFullBadge(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const s = Math.max(1, scale);
  ctx.fillStyle = "#D96C5A";
  ctx.fillRect(Math.round(x - 3 * s), Math.round(y - 1.5 * s), Math.round(6 * s), Math.round(4 * s));
  ctx.fillStyle = "#FBF5EA";
  ctx.fillRect(Math.round(x - 1.8 * s), Math.round(y), Math.round(3.6 * s), Math.max(1, Math.round(s)));
}
