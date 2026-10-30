"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

interface BlogErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BlogError({ error, reset }: BlogErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="py-24 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center animate-reveal">
            <div className="w-12 h-12 bg-muted rounded-full mb-4 flex items-center justify-center font-mono text-muted-foreground">
              !
            </div>
            <h1 className="text-2xl md:text-4xl font-serif font-bold tracking-tight">
              The archives are unavailable.
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
              Something went wrong while loading the blog. Try again in a
              moment, or head back to the newest dispatches.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={reset}
                className="rounded-sm bg-primary px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Try again
              </button>
              <Link
                href="/blog"
                className="rounded-sm border border-border px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                Back to the blog
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
