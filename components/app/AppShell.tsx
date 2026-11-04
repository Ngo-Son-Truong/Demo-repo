"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BackgroundEnvironment } from "@/components/background/BackgroundEnvironment";
import { PixelWorld } from "@/components/world/PixelWorld";
import { CommunicationPanel } from "@/components/communication/CommunicationPanel";
import { TablePreview } from "@/components/table/TablePreview";
import { CreateTableModal, type TableDraft } from "@/components/table/CreateTableModal";
import { JoinTableModal } from "@/components/table/JoinTableModal";
import { InviteFriendsModal } from "@/components/table/InviteFriendsModal";
import { UserProfile } from "@/components/profile/UserProfile";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ToastViewport, type ToastItem } from "@/components/ui/Toast";
import { SEED_MESSAGES, SEED_TABLES, SUGGESTED_REPLIES } from "@/lib/data/tables";
import { SCENES } from "@/lib/data/scenes";
import type { AmbientAudioController } from "@/lib/hooks/useAmbientAudio";
import { useLocalMedia } from "@/lib/hooks/useLocalMedia";
import type {
  CafeTable,
  ChatMessage,
  Participant,
  SceneThemeId,
  UserProfile as UserProfileType,
} from "@/lib/types";
import { createId, createInviteCode } from "@/lib/utils";

type ModalKind = "create" | "join" | "invite" | "profile" | "settings" | null;

interface AppShellProps {
  profile: UserProfileType;
  audio: AmbientAudioController;
  initialInviteCode?: string | null;
  onEditProfile: () => void;
  onSignOut: () => void;
}

const SPOTS = [
  { x: 0.27, y: 0.86 },
  { x: 0.52, y: 0.87 },
  { x: 0.66, y: 0.6 },
  { x: 0.32, y: 0.6 },
  { x: 0.83, y: 0.68 },
  { x: 0.46, y: 0.48 },
];

function pickSpot(tables: CafeTable[]) {
  let best = SPOTS[0];
  let bestScore = -1;
  SPOTS.forEach((spot) => {
    const score = tables.reduce((min, table) => {
      const distance = Math.hypot(table.position.x - spot.x, (table.position.y - spot.y) * 1.6);
      return Math.min(min, distance);
    }, 10);
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  });
  return best;
}

export function AppShell({
  profile,
  audio,
  initialInviteCode,
  onEditProfile,
  onSignOut,
}: AppShellProps) {
  const [tables, setTables] = useState<CafeTable[]>(SEED_TABLES);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({});
  const [modal, setModal] = useState<ModalKind>(null);
  const [joinTargetId, setJoinTargetId] = useState<string | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [theme, setTheme] = useState<SceneThemeId>("rainyCafe");
  const [nightMode, setNightMode] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [visited, setVisited] = useState(0);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const media = useLocalMedia();

  const activeTable = useMemo(
    () => tables.find((table) => table.id === activeTableId) ?? null,
    [tables, activeTableId],
  );
  const scene = SCENES.find((item) => item.id === theme) ?? SCENES[0];
  const activeRef = useRef(activeTableId);
  activeRef.current = activeTableId;

  const pushToast = useCallback((title: string, description?: string, tone?: ToastItem["tone"]) => {
    const id = createId("toast");
    setToasts((current) => [...current, { id, title, description, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4600);
  }, []);

  const selfParticipant: Participant = useMemo(
    () => ({
      id: profile.id,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      micOn,
      cameraOn,
      speaking: micOn && media.speaking,
      isSelf: true,
      connection: "connected",
    }),
    [profile, micOn, cameraOn, media.speaking],
  );

  const displayTables = useMemo(
    () =>
      tables.map((table) =>
        table.id === activeTableId
          ? {
              ...table,
              participants: [
                ...table.participants,
                { ...selfParticipant, isHost: table.ownerId === profile.id },
              ],
            }
          : table,
      ),
    [tables, activeTableId, selfParticipant, profile.id],
  );

  const activeDisplayTable = displayTables.find((table) => table.id === activeTableId) ?? null;
  const onlineCount =
    tables.reduce((total, table) => total + table.participants.length, 0) + 4;

  const joinTable = useCallback(
    (tableId: string, password?: string, viaInvite = false): string | null => {
      const table = tables.find((item) => item.id === tableId);
      if (!table) return "Không tìm thấy bàn này.";
      if (table.locked && table.ownerId !== profile.id) return "Bàn đang khoá.";
      if (table.participants.length >= table.capacity) return "Bàn đã đầy.";
      if (
        table.visibility === "private" &&
        table.password &&
        table.ownerId !== profile.id &&
        !viaInvite &&
        password !== table.password
      ) {
        return "Mật khẩu chưa đúng. Thử lại nhé.";
      }

      setActiveTableId(tableId);
      setSelectedTableId(null);
      setJoinTargetId(null);
      setModal(null);
      setTypingName(null);
      setMobilePanelOpen(true);
      setVisited((value) => value + 1);
      setMessages((current) => [
        ...current,
        {
          id: createId("msg"),
          tableId,
          authorId: profile.id,
          authorName: profile.nickname,
          avatarId: profile.avatarId,
          text: `Bạn đã kéo ghế vào ${table.name}. Chào mọi người nhé!`,
          createdAt: Date.now(),
          system: true,
        },
      ]);
      pushToast(`Đã vào ${table.name}`, "Micro và camera vẫn đang tắt.", "success");
      return null;
    },
    [tables, profile, pushToast],
  );

  const requestJoin = useCallback(
    (tableId: string) => {
      const table = tables.find((item) => item.id === tableId);
      if (!table) return;
      if (table.participants.length >= table.capacity) {
        pushToast("Bàn đã đầy", "Chọn một bàn khác trong sảnh nhé.");
        return;
      }
      if (table.locked && table.ownerId !== profile.id) {
        pushToast("Bàn đang khoá", "Chủ bàn tạm khoá bàn này rồi.");
        return;
      }
      if (table.visibility === "private" && table.ownerId !== profile.id) {
        setJoinTargetId(tableId);
        setSelectedTableId(null);
        setModal("join");
        return;
      }
      joinTable(tableId);
    },
    [tables, joinTable, profile.id, pushToast],
  );

  const leaveTable = useCallback(() => {
    if (!activeTableId) return;
    const name = activeTable?.name ?? "bàn";
    setActiveTableId(null);
    setTypingName(null);
    setMobilePanelOpen(false);
    if (micOn) {
      media.stopMic();
      setMicOn(false);
    }
    if (cameraOn) {
      media.stopCamera();
      setCameraOn(false);
    }
    pushToast(`Đã rời ${name}`, "Nhạc nền và không gian vẫn đang chờ bạn.");
  }, [activeTableId, activeTable, micOn, cameraOn, media, pushToast]);

  const toggleMic = useCallback(async () => {
    if (!activeTable) return;
    if (!activeTable.voiceEnabled) {
      pushToast("Bàn này chỉ chat chữ", "Chủ bàn đã tắt voice chat.");
      return;
    }
    if (micOn) {
      media.stopMic();
      setMicOn(false);
      return;
    }
    const stream = await media.enableMic();
    if (stream) {
      setMicOn(true);
    } else {
      pushToast("Không bật được micro", "Kiểm tra quyền truy cập micro của trình duyệt.");
    }
  }, [activeTable, micOn, media, pushToast]);

  const toggleCamera = useCallback(async () => {
    if (!activeTable) return;
    if (cameraOn) {
      media.stopCamera();
      setCameraOn(false);
      return;
    }
    const stream = await media.enableCamera();
    if (stream) {
      setCameraOn(true);
    } else {
      pushToast("Không bật được camera", "Kiểm tra quyền truy cập camera của trình duyệt.");
    }
  }, [activeTable, cameraOn, media, pushToast]);

  const sendMessage = useCallback(
    (text: string) => {
      const table = activeTable;
      if (!table) return;
      const tableId = table.id;
      setMessages((current) => [
        ...current,
        {
          id: createId("msg"),
          tableId,
          authorId: profile.id,
          authorName: profile.nickname,
          avatarId: profile.avatarId,
          text,
          createdAt: Date.now(),
        },
      ]);
      setBubbles((current) => ({ ...current, [profile.id]: { text, at: Date.now() } }));

      const others = table.participants.filter((participant) => !participant.isSelf);
      if (!others.length) return;
      const responder = others[Math.floor(Math.random() * others.length)];
      const reply =
        SUGGESTED_REPLIES[Math.floor(Math.random() * SUGGESTED_REPLIES.length)];
      setTypingName(responder.nickname);
      window.setTimeout(() => {
        setTypingName((name) => (name === responder.nickname ? null : name));
        if (activeRef.current !== tableId) return;
        setMessages((current) => [
          ...current,
          {
            id: createId("msg"),
            tableId,
            authorId: responder.id,
            authorName: responder.nickname,
            avatarId: responder.avatarId,
            text: reply,
            createdAt: Date.now(),
          },
        ]);
        setBubbles((current) => ({
          ...current,
          [responder.id]: { text: reply, at: Date.now() },
        }));
      }, 1600 + Math.random() * 1500);
    },
    [activeTable, profile, pushToast],
  );

  const createTable = useCallback(
    (draft: TableDraft) => {
      const id = createId("table");
      const table: CafeTable = {
        id,
        name: draft.name,
        topic: draft.topic,
        visibility: draft.visibility,
        capacity: draft.capacity,
        ownerId: profile.id,
        inviteCode: createInviteCode(),
        password: draft.password || undefined,
        locked: false,
        voiceEnabled: draft.voiceEnabled,
        position: pickSpot(tables),
        participants: [],
      };
      setTables((current) => [...current, table]);
      setModal(null);
      window.setTimeout(() => {
        setActiveTableId(id);
        setSelectedTableId(null);
        setMobilePanelOpen(true);
        setVisited((value) => value + 1);
        setMessages((current) => [
          ...current,
          {
            id: createId("msg"),
            tableId: id,
            authorId: profile.id,
            authorName: profile.nickname,
            avatarId: profile.avatarId,
            text: `Bạn vừa mở ${draft.name}. Mã mời: ${table.inviteCode}`,
            createdAt: Date.now(),
            system: true,
          },
        ]);
        pushToast(`Đã mở ${draft.name}`, `Mã mời ${table.inviteCode} · bạn là chủ bàn.`, "success");
      }, 120);
    },
    [tables, profile, pushToast],
  );

  const kickParticipant = useCallback(
    (participant: Participant) => {
      setTables((current) =>
        current.map((table) =>
          table.id === activeTableId
            ? {
                ...table,
                participants: table.participants.filter((item) => item.id !== participant.id),
              }
            : table,
        ),
      );
      pushToast(`Đã mời ${participant.nickname} rời bàn`);
    },
    [activeTableId, pushToast],
  );

  const toggleLock = useCallback(() => {
    if (!activeTable) return;
    setTables((current) =>
      current.map((table) =>
        table.id === activeTable.id ? { ...table, locked: !table.locked } : table,
      ),
    );
    pushToast(activeTable.locked ? "Đã mở khoá bàn" : "Đã khoá bàn", "Chỉ chủ bàn mới thay đổi được.");
  }, [activeTable, pushToast]);

  const openInvite = useCallback(() => {
    const target = activeTable ?? tables.find((table) => table.id === selectedTableId);
    if (!target) {
      pushToast("Chọn một bàn trước", "Click vào một chiếc bàn trong sảnh để lấy mã mời.");
      return;
    }
    setModal("invite");
  }, [activeTable, tables, selectedTableId, pushToast]);

  /* Simulated presence: other people's mics breathe in and out. */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTables((current) =>
        current.map((table) => ({
          ...table,
          participants: table.participants.map((participant) =>
            participant.micOn
              ? { ...participant, speaking: Math.random() < 0.4 }
              : participant.speaking
                ? { ...participant, speaking: false }
                : participant,
          ),
        })),
      );
    }, 2400);
    return () => window.clearInterval(interval);
  }, []);

  /* Keep the bubble map small. */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setBubbles((current) => {
        const now = Date.now();
        const entries = Object.entries(current).filter(([, value]) => now - value.at < 9000);
        return Object.fromEntries(entries);
      });
    }, 7000);
    return () => window.clearInterval(interval);
  }, []);

  /* Soft welcome once the room has settled. */
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current) return;
    welcomed.current = true;
    const timer = window.setTimeout(() => {
      if (!activeRef.current) {
        pushToast(
          `Chào ${profile.nickname} ☕`,
          "Click vào một chiếc bàn để xem ai đang ngồi đó, hoặc mở bàn của riêng bạn.",
        );
      }
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [profile.nickname, pushToast]);

  /* Deep link: /join/CODE */
  const handledInvite = useRef(false);
  useEffect(() => {
    if (!initialInviteCode || handledInvite.current) return;
    handledInvite.current = true;
    const code = initialInviteCode.trim().toUpperCase();
    const table = tables.find((item) => item.inviteCode.toUpperCase() === code);
    if (!table) {
      pushToast("Không tìm thấy mã mời", `Mã ${code} chưa gắn với bàn nào trong sảnh.`);
      return;
    }
    if (table.participants.length >= table.capacity) {
      pushToast("Bàn trong link đã đầy", "Bạn vẫn có thể ghé một bàn khác.");
      return;
    }
    window.setTimeout(() => joinTable(table.id, table.password, true), 500);
  }, [initialInviteCode, tables, joinTable, pushToast]);

  const mediaError = media.error;
  const clearMediaError = media.clearError;
  useEffect(() => {
    if (mediaError) {
      pushToast("Thiết bị chưa sẵn sàng", mediaError);
      clearMediaError();
    }
  }, [mediaError, clearMediaError, pushToast]);

  const inviteTarget =
    tables.find((table) => table.id === (activeTableId ?? selectedTableId)) ?? activeTable ?? null;
  const joinTarget = tables.find((table) => table.id === joinTargetId) ?? null;
  const activeMessages = activeTableId
    ? messages.filter((message) => message.tableId === activeTableId)
    : [];

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-cream">
      <TopBar
        profile={profile}
        scene={scene}
        onlineCount={onlineCount}
        onOpenProfile={() => setModal("profile")}
        onOpenSettings={() => setModal("settings")}
        onOpenInvite={openInvite}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-2.5 px-2.5 pb-2.5 lg:flex-row lg:gap-3 lg:px-3 lg:pb-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 lg:gap-3">
          <BackgroundEnvironment
            theme={theme}
            nightMode={nightMode}
            onThemeChange={setTheme}
            onToggleNight={() => setNightMode((value) => !value)}
            audio={audio}
          />
          <PixelWorld
            tables={displayTables}
            profile={profile}
            activeTableId={activeTableId}
            selectedTableId={selectedTableId}
            bubbles={bubbles}
            onSelectTable={setSelectedTableId}
            onJoinTable={requestJoin}
            onCreateTable={() => setModal("create")}
            onOpenInvite={openInvite}
            onShare={(table) => {
              setSelectedTableId(table.id);
              setModal("invite");
            }}
            onlineCount={onlineCount}
          />
        </div>

        {activeDisplayTable && (
          <div className="hidden w-[18%] min-w-[272px] max-w-[340px] shrink-0 lg:block">
            <CommunicationPanel
              table={activeDisplayTable}
              selfId={profile.id}
              messages={activeMessages}
              typingName={typingName}
              micOn={micOn}
              cameraOn={cameraOn}
              cameraStream={media.cameraStream}
              speaking={media.speaking}
              micLevel={media.micLevel}
              isHost={activeDisplayTable.ownerId === profile.id}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onLeave={leaveTable}
              onInvite={openInvite}
              onKick={kickParticipant}
              onToggleLock={toggleLock}
              onCollapse={() => undefined}
              onSendMessage={sendMessage}
            />
          </div>
        )}
      </main>

      {activeDisplayTable && (
        <>
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="focus-ring fixed bottom-3 right-3 z-30 flex items-center gap-2 rounded-full bg-ink px-3.5 py-2.5 text-xs font-semibold text-parchment shadow-panel lg:hidden"
          >
            <MessagesSquare className="h-4 w-4 text-honey" />
            {activeDisplayTable.name}
            <span className="rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[9px]">
              {activeDisplayTable.participants.length}/{activeDisplayTable.capacity}
            </span>
          </button>

          {mobilePanelOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button
                type="button"
                aria-label="Đóng khu vực giao tiếp"
                onClick={() => setMobilePanelOpen(false)}
                className="absolute inset-0 bg-[#171310]/55 backdrop-blur-sm animate-fadeIn"
              />
              <div className="absolute inset-x-0 bottom-0 h-[82dvh] animate-fadeUp p-2">
                <CommunicationPanel
                  table={activeDisplayTable}
                  selfId={profile.id}
                  messages={activeMessages}
                  typingName={typingName}
                  micOn={micOn}
                  cameraOn={cameraOn}
                  cameraStream={media.cameraStream}
                  speaking={media.speaking}
                  micLevel={media.micLevel}
                  isHost={activeDisplayTable.ownerId === profile.id}
                  onToggleMic={toggleMic}
                  onToggleCamera={toggleCamera}
                  onLeave={leaveTable}
                  onInvite={openInvite}
                  onKick={kickParticipant}
                  onToggleLock={toggleLock}
                  onCollapse={() => setMobilePanelOpen(false)}
                  onSendMessage={sendMessage}
                />
              </div>
            </div>
          )}
        </>
      )}


      <CreateTableModal
        open={modal === "create"}
        onClose={() => setModal(null)}
        defaultName={`Bàn của ${profile.nickname}`}
        onCreate={createTable}
      />

      <JoinTableModal
        open={modal === "join"}
        table={joinTarget}
        onClose={() => {
          setModal(null);
          setJoinTargetId(null);
        }}
        onJoin={(password) => (joinTarget ? joinTable(joinTarget.id, password) : "Bàn không còn tồn tại.")}
        onJoinByCode={(code) => {
          const table = tables.find(
            (item) => item.inviteCode.toUpperCase() === code.trim().toUpperCase(),
          );
          if (!table) return "Mã mời không tồn tại. Kiểm tra lại nhé.";
          if (table.participants.length >= table.capacity) return "Bàn trong mã mời đã đầy.";
          return joinTable(table.id, table.password, true);
        }}
      />

      <InviteFriendsModal
        open={modal === "invite"}
        table={inviteTarget}
        onClose={() => setModal(null)}
        onInvite={(name) => {
          pushToast(`Đã gửi lời mời tới ${name}`, `Mã mời ${inviteTarget?.inviteCode ?? ""}`, "success");
          setModal(null);
        }}
        onCopy={(label) => pushToast(label, "Sẵn sàng gửi cho bạn bè của bạn.", "success")}
      />

      <UserProfile
        open={modal === "profile"}
        profile={profile}
        tablesVisited={visited}
        onClose={() => setModal(null)}
        onEdit={() => {
          setModal(null);
          onEditProfile();
        }}
        onSignOut={() => {
          setModal(null);
          onSignOut();
        }}
      />

      <SettingsPanel
        open={modal === "settings"}
        onClose={() => setModal(null)}
        audio={audio}
        theme={theme}
        onThemeChange={setTheme}
        nightMode={nightMode}
        onToggleNight={() => setNightMode((value) => !value)}
      />

      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </div>
  );
}
