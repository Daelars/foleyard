"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  trigger,
  src,
  type,
  alt,
  poster,
}: {
  trigger: ReactNode;
  src: string;
  type: "image" | "video";
  alt?: string;
  poster?: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      previousFocusRef.current?.focus();
    }, 180);
  }, []);

  const openModal = () => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      const closeButton = modalRef.current?.querySelector<HTMLButtonElement>(
        "button",
      );
      closeButton?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, video, [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openModal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openModal();
          }
        }}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {mounted && open
        ? createPortal(
        <div
          className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm ${
            closing ? "modal-backdrop-out" : "modal-backdrop-in"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onMouseDown={close}
        >
          <div
            ref={modalRef}
            className={`relative ${
              type === "video"
                ? "flex h-full w-full items-center justify-center"
                : "max-h-[90vh] max-w-[90vw] overflow-auto rounded-2xl border border-white/10 bg-background p-2 shadow-2xl"
            } ${
              closing ? "modal-content-out" : "modal-content-in"
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close modal"
              onClick={close}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-xl leading-none text-white backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
            >
              ×
            </button>

            {type === "video" ? (
              <video
                autoPlay
                controls
                playsInline
                preload="auto"
                poster={poster}
                className="max-h-[calc(100vh-2rem)] w-full max-w-[min(1600px,calc(100vw-2rem))] rounded-xl bg-black object-contain shadow-2xl"
              >
                <source src={src} type="video/mp4" />
              </video>
            ) : (
              <img
                src={src}
                alt={alt ?? ""}
                className="h-auto max-h-[85vh] w-auto rounded-xl"
              />
            )}
          </div>
        </div>,
        document.body,
          )
        : null}
    </>
  );
}
