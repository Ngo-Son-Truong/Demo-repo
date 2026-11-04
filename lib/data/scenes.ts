import type { SceneTheme } from "@/lib/types";

export const SCENES: SceneTheme[] = [
  {
    id: "rainyCafe",
    label: "Cà phê đêm mưa",
    mood: "Mưa rơi ngoài cửa sổ",
    light: "night",
    swatch: "linear-gradient(140deg,#2b3d55 0%,#5a4632 60%,#ffc873 100%)",
  },
  {
    id: "cozyRoom",
    label: "Phòng ngủ ấm",
    mood: "Đèn vàng & chăn len",
    light: "night",
    swatch: "linear-gradient(140deg,#3b2b22 0%,#8a6244 55%,#ffd79a 100%)",
  },
  {
    id: "sunset",
    label: "Hoàng hôn biển",
    mood: "Gió chiều man mát",
    light: "day",
    swatch: "linear-gradient(160deg,#2b2a4e 0%,#e58a5b 55%,#ffce86 100%)",
  },
  {
    id: "ocean",
    label: "Sóng biển",
    mood: "Sóng vỗ rì rào",
    light: "day",
    swatch: "linear-gradient(160deg,#8fd0db 0%,#0e7f94 60%,#084c5c 100%)",
  },
  {
    id: "starry",
    label: "Bầu trời sao",
    mood: "Đồi núi tĩnh lặng",
    light: "night",
    swatch: "linear-gradient(160deg,#080e22 0%,#2b3355 55%,#ffc873 100%)",
  },
  {
    id: "forest",
    label: "Rừng mưa nhẹ",
    mood: "Lá cây & hơi ẩm",
    light: "day",
    swatch: "linear-gradient(160deg,#33453a 0%,#1e2e26 60%,#e9e28a 100%)",
  },
  {
    id: "japaneseCafe",
    label: "Quán Nhật",
    mood: "Gỗ thông & đèn lồng",
    light: "night",
    swatch: "linear-gradient(160deg,#f3e7ce 0%,#3c2c22 55%,#f08a4b 100%)",
  },
  {
    id: "cityNight",
    label: "Thành phố đêm",
    mood: "Ánh đèn từ trên cao",
    light: "night",
    swatch: "linear-gradient(160deg,#0e1220 0%,#4a2f35 60%,#ffc873 100%)",
  },
];
