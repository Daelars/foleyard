"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (process.env.NODE_ENV === "production") return null;

  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const go = (next: number) => {
    const wrapped = (next + variants.length) % variants.length;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", variants[wrapped].key);
    router.replace(`?${params.toString()}`);
  };

  if (typeof window !== "undefined") {
    // keyboard nav handled via effect-like registration
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#0c0a09",
        color: "#fafaf9",
        border: "2px solid #f97316",
        borderRadius: 999,
        padding: "8px 16px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
      }}
    >
      <button
        aria-label="Previous variant"
        onClick={() => go(idx - 1)}
        style={{ fontSize: 18 }}
      >
        ←
      </button>
      <span style={{ fontFamily: "monospace", fontSize: 12 }}>
        PROTOTYPE {variants[idx].key} — {variants[idx].label}
      </span>
      <button
        aria-label="Next variant"
        onClick={() => go(idx + 1)}
        style={{ fontSize: 18 }}
      >
        →
      </button>
    </div>
  );
}
