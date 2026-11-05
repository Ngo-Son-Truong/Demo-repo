import type { AvatarLook } from "@/lib/types";

export const AVATARS: AvatarLook[] = [
  {
    id: "moss",
    name: "Moss",
    skin: "#F0C9A0",
    hair: "#3E2A20",
    hairStyle: "bob",
    outfit: "#0799AD",
    accent: "#FFBD59",
    pronouns: "she/her",
  },
  {
    id: "cocoa",
    name: "Cocoa",
    skin: "#C98B62",
    hair: "#2B1B14",
    hairStyle: "curly",
    outfit: "#76543B",
    accent: "#F5EBDD",
    pronouns: "he/him",
  },
  {
    id: "honey",
    name: "Honey",
    skin: "#F4D2AE",
    hair: "#C9822F",
    hairStyle: "bun",
    outfit: "#FFBD59",
    accent: "#252525",
    pronouns: "they/them",
  },
  {
    id: "matcha",
    name: "Matcha",
    skin: "#E7B98D",
    hair: "#5A3C2A",
    hairStyle: "short",
    outfit: "#7E9C6B",
    accent: "#F5EBDD",
    pronouns: "she/her",
  },
  {
    id: "plum",
    name: "Plum",
    skin: "#B87A55",
    hair: "#1F1512",
    hairStyle: "long",
    outfit: "#9B5F86",
    accent: "#F5EBDD",
    pronouns: "he/him",
  },
  {
    id: "sky",
    name: "Sky",
    skin: "#F6D8BC",
    hair: "#8A6A4A",
    hairStyle: "cap",
    outfit: "#CBD5E1",
    accent: "#0799AD",
    pronouns: "he/him",
  },
  {
    id: "peach",
    name: "Peach",
    skin: "#F2C6A0",
    hair: "#D67F5A",
    hairStyle: "bob",
    outfit: "#E58C7A",
    accent: "#FFBD59",
    pronouns: "she/her",
  },
  {
    id: "midnight",
    name: "Midnight",
    skin: "#A4693F",
    hair: "#151011",
    hairStyle: "short",
    outfit: "#2F3B52",
    accent: "#0799AD",
    pronouns: "they/them",
  },
];

export const AVATAR_MAP: Record<string, AvatarLook> = AVATARS.reduce(
  (acc, avatar) => {
    acc[avatar.id] = avatar;
    return acc;
  },
  {} as Record<string, AvatarLook>,
);

export function getAvatar(id: string): AvatarLook {
  return AVATAR_MAP[id] ?? AVATARS[0];
}
