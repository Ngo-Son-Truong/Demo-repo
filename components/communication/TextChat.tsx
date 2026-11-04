"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Smile } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { getAvatar } from "@/lib/data/avatars";
import { AvatarSprite } from "@/components/ui/AvatarSprite";
import { cn, formatTime } from "@/lib/utils";

const EMOJIS = ["☕", "🌧️", "🎧", "😊", "😂", "❤️", "🎹", "🌙", "✨"];

interface TextChatProps {
  messages: ChatMessage[];
  selfId: string;
  typingName?: string | null;
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function TextChat({ messages, selfId, typingName, onSend, disabled }: TextChatProps) {
  const [value, setValue] = useState("");
  const chatMessages = messages.filter((message) => !message.system);
  const hasContent = chatMessages.length > 0;
  const [showEmojis, setShowEmojis] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, typingName]);

  const send = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    setShowEmojis(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h3 className="font-mono text-[9px] uppercase tracking-[0.24em] text-cocoa/50">trò chuyện</h3>
        <span className="font-mono text-[9px] text-cocoa/35">{chatMessages.length} tin nhắn</span>
      </div>

      <div
        ref={scrollRef}
        className="chill-scroll min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-cocoa/10 bg-white/45 p-2"
      >
        {!hasContent && (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-lg">☕</span>
            <p className="text-[11px] font-medium text-cocoa/60">Chưa có tin nhắn nào</p>
            <p className="text-[10px] leading-relaxed text-cocoa/40">
              Chào mọi người một câu nhé — im lặng cũng không sao.
            </p>
          </div>
        )}

        {hasContent &&
          messages.map((message) => {
          if (message.system) {
            return (
              <p
                key={message.id}
                className="mx-auto w-fit rounded-full bg-cocoa/10 px-2 py-0.5 text-center text-[9px] text-cocoa/55"
              >
                {message.text}
              </p>
            );
          }
          const self = message.authorId === selfId;
          const avatar = getAvatar(message.avatarId);
          return (
            <div key={message.id} className={cn("flex gap-1.5", self && "flex-row-reverse")}>
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-cream">
                <AvatarSprite avatarId={avatar.id} size={15} animate={false} />
              </span>
              <div className={cn("max-w-[86%]", self && "text-right")}>
                <div className={cn("flex items-baseline gap-1.5", self && "justify-end")}>
                  <span className="text-[10px] font-semibold text-cocoa/80">
                    {self ? "Bạn" : message.authorName}
                  </span>
                  <span className="font-mono text-[8px] text-cocoa/35">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 inline-block rounded-xl px-2.5 py-1.5 text-left text-[11.5px] leading-relaxed",
                    self
                      ? "rounded-tr-sm bg-ink text-parchment"
                      : "rounded-tl-sm border border-cocoa/10 bg-white/85 text-ink",
                  )}
                >
                  {message.text}
                </p>
              </div>
            </div>
          );
        })}

        {typingName && (
          <div className="flex items-center gap-1.5 pl-1">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1 w-1 animate-[blink_1s_ease-in-out_infinite] rounded-full bg-cocoa/40"
                  style={{ animationDelay: `${index * 0.15}s` }}
                />
              ))}
            </span>
            <span className="text-[9px] text-cocoa/40">{typingName} đang gõ…</span>
          </div>
        )}
      </div>

      <div className="relative mt-2">
        {showEmojis && (
          <div className="absolute bottom-full left-0 mb-1.5 flex w-full flex-wrap gap-0.5 rounded-xl border border-cocoa/15 bg-parchment p-1.5 shadow-panel animate-popIn">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setValue((current) => `${current}${emoji}`);
                  setShowEmojis(false);
                  inputRef.current?.focus();
                }}
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-sm transition hover:bg-honey/25"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-xl border border-cocoa/15 bg-white/80 px-2 py-1">
          <button
            type="button"
            onClick={() => setShowEmojis((open) => !open)}
            aria-label="Chọn emoji"
            className="focus-ring rounded p-1 text-cocoa/40 transition hover:text-cocoa/80"
          >
            <Smile className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            disabled={disabled}
            placeholder="Nhắn gì đó thật nhẹ nhàng…"
            aria-label="Tin nhắn"
            className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-ink outline-none placeholder:text-cocoa/35"
          />
          <button
            type="button"
            onClick={send}
            disabled={!value.trim() || disabled}
            aria-label="Gửi tin nhắn"
            className={cn(
              "focus-ring grid h-7 w-7 place-items-center rounded-lg transition",
              value.trim() && !disabled
                ? "bg-ink text-parchment hover:bg-cocoaDark"
                : "bg-cocoa/10 text-cocoa/30",
            )}
          >
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
