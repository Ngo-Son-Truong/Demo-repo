"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  dismissable?: boolean;
}

const widths = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  dismissable = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "input, textarea, button:not([data-close])",
      );
      focusable?.focus();
    }, 80);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      data-typing-guard="true"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        data-close
        aria-label="Đóng"
        className="absolute inset-0 cursor-default bg-[#171310]/60 backdrop-blur-[6px] animate-fadeIn"
        onClick={dismissable ? onClose : undefined}
      />
      <div
        ref={panelRef}
        className={cn(
          "chill-scroll relative max-h-[92dvh] w-full animate-popIn overflow-y-auto rounded-[26px] border border-cocoa/15 bg-parchment shadow-panel",
          widths[width],
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-honey/25 blur-2xl" />
        {(title || dismissable) && (
          <div className="relative flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              {title && (
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
              )}
              {description && <p className="mt-1 text-sm leading-relaxed text-cocoa/75">{description}</p>}
            </div>
            {dismissable && (
              <button
                type="button"
                data-close
                onClick={onClose}
                aria-label="Đóng"
                className="focus-ring -mr-1 -mt-1 rounded-full border border-cocoa/15 bg-white/60 p-1.5 text-cocoa transition hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="relative px-6 py-5">{children}</div>
        {footer && <div className="relative border-t border-cocoa/10 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
