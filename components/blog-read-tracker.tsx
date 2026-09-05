"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/posthog-events";

export function BlogReadTracker({ slug }: { slug: string }) {
  const fired = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (fired.current) return;
      const doc = document.documentElement;
      const depth =
        (window.scrollY + window.innerHeight) / doc.scrollHeight;
      if (depth >= 0.8) {
        fired.current = true;
        track("blog_post_read", { slug });
        window.removeEventListener("scroll", onScroll);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);

  return null;
}
