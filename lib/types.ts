export type HairStyle = "bob" | "short" | "bun" | "long" | "curly" | "cap";

export interface AvatarLook {
  id: string;
  name: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: string;
  accent: string;
  pronouns: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatarId: string;
  status: string;
}

export type TableVisibility = "public" | "private";

export interface Participant {
  id: string;
  nickname: string;
  avatarId: string;
  micOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
  handRaised?: boolean;
  isHost?: boolean;
  isSelf?: boolean;
  connection?: "connected" | "connecting" | "reconnecting";
}

export interface CafeTable {
  id: string;
  name: string;
  topic: string;
  visibility: TableVisibility;
  capacity: number;
  ownerId: string;
  inviteCode: string;
  password?: string;
  locked: boolean;
  voiceEnabled: boolean;
  position: { x: number; y: number };
  participants: Participant[];
}

export interface ChatMessage {
  id: string;
  tableId: string;
  authorId: string;
  authorName: string;
  avatarId: string;
  text: string;
  createdAt: number;
  system?: boolean;
}

export type SceneThemeId =
  | "rainyCafe"
  | "cozyRoom"
  | "sunset"
  | "ocean"
  | "starry"
  | "forest"
  | "japaneseCafe"
  | "cityNight";

export interface SceneTheme {
  id: SceneThemeId;
  label: string;
  mood: string;
  light: "day" | "night";
  swatch: string;
}

export type MusicMood = "lofi" | "jazz" | "piano" | "soft";

export interface AmbienceSettings {
  playing: boolean;
  volume: number;
  mood: MusicMood;
  rain: boolean;
  waves: boolean;
  birds: boolean;
  wind: boolean;
}
