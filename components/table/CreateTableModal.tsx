"use client";

import { useEffect, useState } from "react";
import { Globe2, Lock, Minus, Plus, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { TableVisibility } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TableDraft {
  name: string;
  topic: string;
  visibility: TableVisibility;
  capacity: number;
  password: string;
  voiceEnabled: boolean;
}

interface CreateTableModalProps {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  onCreate: (draft: TableDraft) => void;
}

export function CreateTableModal({ open, onClose, defaultName, onCreate }: CreateTableModalProps) {
  const [name, setName] = useState(defaultName);
  const [topic, setTopic] = useState("");
  const [visibility, setVisibility] = useState<TableVisibility>("public");
  const [capacity, setCapacity] = useState(6);
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setTopic("");
      setVisibility("public");
      setCapacity(6);
      setPassword("");
      setUsePassword(false);
      setVoiceEnabled(true);
      setError(null);
    }
  }, [open, defaultName]);

  const submit = () => {
    if (!name.trim()) {
      setError("Đặt cho bàn một cái tên nhé.");
      return;
    }
    if (visibility === "private" && usePassword && password.trim().length < 3) {
      setError("Mật khẩu cần ít nhất 3 ký tự.");
      return;
    }
    onCreate({
      name: name.trim(),
      topic: topic.trim() || "Một góc nhỏ để thư giãn cùng nhau",
      visibility,
      capacity,
      password: visibility === "private" && usePassword ? password.trim() : "",
      voiceEnabled,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mở một bàn mới"
      description="Chọn không khí cho bàn của bạn — mọi người có thể kéo ghế vào bất cứ lúc nào."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-cocoa/50">
            <ShieldCheck className="h-3 w-3" /> bàn mới sẽ do bạn làm chủ
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Huỷ
            </button>
            <button type="button" onClick={submit} className="btn-primary">
              Tạo bàn
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="table-name" className="text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/60">
            Tên bàn
          </label>
          <input
            id="table-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={32}
            placeholder="Bàn của những người thích mưa"
            className="focus-ring mt-1.5 w-full rounded-xl border border-cocoa/20 bg-white/70 px-3 py-2.5 text-sm text-ink placeholder:text-cocoa/35"
          />
        </div>

        <div>
          <label htmlFor="table-topic" className="text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/60">
            Mô tả ngắn
          </label>
          <textarea
            id="table-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={90}
            rows={2}
            placeholder="Hôm nay bàn này nói về điều gì?"
            className="focus-ring mt-1.5 w-full resize-none rounded-xl border border-cocoa/20 bg-white/70 px-3 py-2.5 text-sm text-ink placeholder:text-cocoa/35"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/60">
              Chế độ
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  { id: "public" as const, label: "Công khai", icon: Globe2, hint: "Ai cũng thấy" },
                  { id: "private" as const, label: "Riêng tư", icon: Lock, hint: "Cần mã mời" },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const active = visibility === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVisibility(option.id)}
                    aria-pressed={active}
                    className={cn(
                      "focus-ring rounded-xl border px-2.5 py-2 text-left transition",
                      active
                        ? "border-teal/60 bg-teal/10 text-tealDeep shadow-[inset_0_0_0_1px_rgba(7,153,173,0.25)]"
                        : "border-cocoa/15 bg-white/50 text-cocoa/70 hover:border-cocoa/30",
                    )}
                  >
                    <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold">
                      <Icon className="h-3 w-3 shrink-0" /> {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cocoa/60">
              Sức chứa
            </span>
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-cocoa/20 bg-white/60 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setCapacity((value) => Math.max(2, value - 1))}
                aria-label="Giảm sức chứa"
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg border border-cocoa/15 bg-white text-cocoa transition hover:bg-cream"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="flex items-baseline gap-1">
                <span className="font-display text-xl font-semibold text-ink">{capacity}</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-cocoa/50">người</span>
              </span>
              <button
                type="button"
                onClick={() => setCapacity((value) => Math.min(8, value + 1))}
                aria-label="Tăng sức chứa"
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg border border-cocoa/15 bg-white text-cocoa transition hover:bg-cream"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex gap-1" aria-hidden>
              {Array.from({ length: 8 }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition",
                    index < capacity ? "bg-honeyDeep" : "bg-cocoa/10",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {visibility === "private" && (
          <div className="animate-fadeIn rounded-xl border border-cocoa/15 bg-white/50 p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-cocoa">
                <Lock className="h-3.5 w-3.5" /> Đặt mật khẩu cho bàn
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={usePassword}
                onClick={() => setUsePassword((value) => !value)}
                className={cn(
                  "focus-ring relative h-5 w-9 rounded-full transition",
                  usePassword ? "bg-teal" : "bg-cocoa/25",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    usePassword ? "left-[18px]" : "left-0.5",
                  )}
                />
              </button>
            </label>
            {usePassword && (
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="vd: chill"
                maxLength={24}
                className="focus-ring mt-2 w-full rounded-lg border border-cocoa/20 bg-white px-3 py-2 text-sm"
              />
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-cocoa/50">
              Bàn riêng tư sẽ không xuất hiện trong danh sách. Bạn bè chỉ vào được bằng mã mời.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setVoiceEnabled((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-cocoa/15 bg-white/50 px-3 py-2.5 text-left transition hover:border-cocoa/30"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-cocoa">
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            Voice chat
            <span className="font-normal text-cocoa/50">
              {voiceEnabled ? "bật cho bàn này" : "chỉ chat chữ"}
            </span>
          </span>
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition",
              voiceEnabled ? "bg-teal" : "bg-cocoa/25",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                voiceEnabled ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
        </button>

        {error && <p className="text-xs font-medium text-[#B4543F]">{error}</p>}
      </div>
    </Modal>
  );
}
