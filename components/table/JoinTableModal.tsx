"use client";

import { useEffect, useState } from "react";
import { KeyRound, Lock, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { CafeTable } from "@/lib/types";
import { PrivateTableIndicator } from "@/components/table/PrivateTableIndicator";

interface JoinTableModalProps {
  open: boolean;
  table: CafeTable | null;
  onClose: () => void;
  onJoin: (password: string) => string | null;
  onJoinByCode: (code: string) => string | null;
}

export function JoinTableModal({ open, table, onClose, onJoin, onJoinByCode }: JoinTableModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setCode("");
      setError(null);
      setMode(table ? "password" : "code");
    }
  }, [open, table]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={mode === "password" && table ? "Bàn riêng tư" : "Tham gia bằng mã mời"}
      description={
        mode === "password" && table
          ? "Nhập mật khẩu để kéo ghế vào bàn này."
          : "Dán mã mời bạn nhận được để tìm đúng chiếc bàn."
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          {table ? (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "code" : "password");
                setError(null);
              }}
              className="focus-ring flex items-center gap-1.5 text-xs font-medium text-tealDeep underline decoration-dotted underline-offset-2"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {mode === "password" ? "Có mã mời?" : "Quay lại nhập mật khẩu"}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (mode === "password") {
                if (!table) return;
                const result = onJoin(password);
                if (result) setError(result);
              } else {
                const result = onJoinByCode(code);
                if (result) setError(result);
              }
            }}
          >
            Vào bàn
          </button>
        </div>
      }
    >
      {mode === "password" && table ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-cocoa/15 bg-white/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{table.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-cocoa/60">
                <Users className="h-3 w-3" />
                {table.participants.length}/{table.capacity} người
              </p>
            </div>
            <PrivateTableIndicator />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cocoa/40" />
            <input
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const result = onJoin(password);
                  if (result) setError(result);
                }
              }}
              type="password"
              placeholder="Mật khẩu của bàn"
              className="focus-ring w-full rounded-xl border border-cocoa/20 bg-white py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          {error && <p className="text-xs font-medium text-[#B4543F]">{error}</p>}
          <p className="rounded-lg bg-honey/15 px-3 py-2 text-[10px] leading-relaxed text-[#8A5A16]">
            Bản demo: mật khẩu của bàn này là <strong>chill</strong> — hoặc dùng mã mời{" "}
            <strong>{table.inviteCode}</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const result = onJoinByCode(code);
                if (result) setError(result);
              }
            }}
            placeholder="ABCD12"
            maxLength={8}
            className="focus-ring w-full rounded-xl border border-cocoa/20 bg-white px-3 py-3 text-center font-mono text-lg font-bold tracking-[0.35em] text-ink placeholder:tracking-[0.3em] placeholder:text-cocoa/25"
          />
          {error && <p className="text-center text-xs font-medium text-[#B4543F]">{error}</p>}
          <p className="text-center text-[10px] leading-relaxed text-cocoa/50">
            Mã mời gồm 6 ký tự. Bàn công khai không cần mã — chỉ cần click vào bàn trong quán.
          </p>
        </div>
      )}
    </Modal>
  );
}
