"use client";

// Three "the product is the page" variants. The demo browser is real: it filters a
// mock 1.2M-file library and plays WebAudio-synthesized previews.
// PROTOTYPE — throwaway, do not ship. See skill: prototype UI sub-shape A.
import { useEffect, useRef, useState } from "react";
import {
  DemoSound,
  FAKE_TOTAL,
  playPreview,
  search,
} from "./demo-engine";

const RELEASE_URL = "https://github.com/Daelars/foleyard-v2/releases/latest";

function CtaButton({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={RELEASE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-mono text-xs font-bold uppercase tracking-widest rounded-full shadow-glow hover:brightness-110 hover:scale-[1.02] transition-all"
    >
      {children}
    </a>
  );
}

const wave = (seed: number, n = 48) =>
  Array.from(
    { length: n },
    (_, i) => 4 + Math.abs(Math.sin(seed + i * 0.55)) * 22,
  );

function Waveform({
  seed,
  active,
  progress = 0,
}: {
  seed: number;
  active: boolean;
  progress?: number;
}) {
  return (
    <div className="flex items-end gap-[2px] h-8" data-waveform="">
      {wave(seed).map((h, i) => {
        const lit = active && i / 48 <= progress;
        return (
          <div
            key={i}
            style={{ height: `${h}px` }}
            className={`w-[2px] rounded-full transition-colors ${
              lit ? "bg-primary" : active
                ? "bg-primary/25"
                : "bg-muted-foreground/40"
            }`}
          />
        );
      })}
    </div>
  );
}

function usePlayer() {
  const [playing, setPlaying] = useState<{
    id: string;
    t0: number;
    dur: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const p = Math.min(
        1,
        (performance.now() - playing.t0) / (playing.dur * 1000),
      );
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(null);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const play = (s: DemoSound) => {
    const dur = playPreview(s);
    if (dur > 0) {
      setProgress(0);
      setPlaying({ id: s.id, t0: performance.now(), dur });
    }
  };

  return { playingId: playing?.id ?? null, progress, play };
}

const TREE: Array<{ label: string; top?: boolean; active?: boolean }> = [
  { label: "SFX/", top: true },
  { label: "Footsteps/" },
  { label: "Gravel/", active: true },
  { label: "Wood/" },
  { label: "Whooshes/" },
  { label: "Impacts/" },
  { label: "Ambience/" },
  { label: "MUSIC/", top: true },
  { label: "Cues/" },
  { label: "Loops/" },
];

function DemoBrowser({
  autoDemo,
  chrome,
  compact,
}: {
  autoDemo?: boolean;
  chrome?: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const userTouched = useRef(false);
  const results = search(query);
  const { playingId, progress, play } = usePlayer();

  useEffect(() => {
    if (!autoDemo) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((res) => timers.push(setTimeout(res, ms)));
    const type = async (q: string) => {
      for (let i = 1; i <= q.length; i++) {
        if (cancelled || userTouched.current) return;
        setQuery(q.slice(0, i));
        await wait(240);
      }
    };
    (async () => {
      await wait(900);
      await type("gravel");
      if (cancelled || userTouched.current) return;
      await wait(500);
      const first = search("gravel")[0];
      if (first && !cancelled && !userTouched.current) play(first);
      await wait(1800);
      if (cancelled || userTouched.current) return;
      setQuery("");
      await type("whoosh");
      if (cancelled || userTouched.current) return;
      await wait(500);
      const w = search("whoosh")[0];
      if (w && !cancelled && !userTouched.current) play(w);
      await wait(1600);
      if (cancelled || userTouched.current) return;
      setQuery("");
      await type("rain");
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  const input = (
    <div className="flex items-center gap-3 px-4 py-3 rounded-md border border-border bg-background font-mono text-sm focus-within:border-primary/60 transition-colors">
      <span className="text-primary">⌕</span>
      <input
        value={query}
        onChange={(e) => {
          userTouched.current = true;
          setQuery(e.target.value);
        }}
        onKeyDown={() => {
          userTouched.current = true;
        }}
        placeholder="type a sound — gravel, whoosh, rain, impact…"
        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50"
        aria-label="Search sounds"
      />
      {query ? (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
          {results.length} of {FAKE_TOTAL.toLocaleString()} · 3 ms
        </span>
      ) : (
        <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
          try: gravel · whoosh · rain · cello
        </span>
      )}
    </div>
  );

  const rows = (
    <div className={compact ? "" : "px-1"}>
      {results.length === 0 && query ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">
          No match for "{query}" — in the real app this is where 1.2 million
          files disagree with you.
        </p>
      ) : null}
      {results.map((r) => {
        const active = playingId === r.id;
        return (
          <button
            key={r.id}
            onClick={() => {
              userTouched.current = true;
              if (active) return;
              play(r);
            }}
            className={`w-full flex items-center gap-4 px-3 py-2 rounded-md text-left transition-colors ${
              active
                ? "bg-primary/10 border border-primary/30"
                : "border border-transparent hover:bg-secondary/40"
            }`}
          >
            <span className="font-mono text-xs text-primary w-4">
              {active ? "❚❚" : "▶"}
            </span>
            <span className="font-mono text-xs text-foreground truncate">
              {r.name}
            </span>
            <span className="hidden md:block ml-auto">
              <Waveform
                seed={r.seed}
                active={active}
                progress={active ? progress : 0}
              />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">
              0:{String(Math.round(r.dur)).padStart(2, "0")}
            </span>
          </button>
        );
      })}
      {results.length > 0 ? (
        <p className="px-3 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          synthesized previews — the real app plays your files
        </p>
      ) : null}
    </div>
  );

  if (!chrome) {
    return (
      <div className="space-y-3">
        {input}
        {rows}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            SFX / Footsteps / Gravel
          </span>
        </div>
        <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded px-2 py-0.5">
          you're using it right now
        </span>
      </div>

      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="hidden md:block border-r border-border p-4 font-mono text-xs space-y-1.5">
          {TREE.map((c) => (
            <p
              key={c.label}
              className={
                c.top
                  ? "text-foreground font-bold uppercase tracking-wide"
                  : c.active
                    ? "pl-3 bg-primary/10 text-primary rounded-sm px-1"
                    : "pl-3 text-muted-foreground"
              }
            >
              {c.label}
            </p>
          ))}
          <div className="pt-4 mt-2 border-t border-border space-y-1.5">
            <p className="text-muted-foreground">♥ Favorites</p>
            <p className="text-muted-foreground">▤ Session 47</p>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {input}
          {rows}
        </div>
      </div>

      <div className="px-4 py-1.5 border-t border-border bg-secondary/50 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {FAKE_TOTAL.toLocaleString()} files indexed · 3 ms · offline
      </div>
    </div>
  );
}

export function VariantLive() {
  return (
    <div className="pb-24">
      <section className="px-6 pt-16 max-w-5xl mx-auto">
        <div className="text-center">
          <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.25em]">
            This is Foleyard. Right now. In your browser.
          </span>
          <h1 className="mt-4 text-5xl md:text-7xl font-serif font-bold leading-[0.9] tracking-tighter">
            Don't read about it.{" "}
            <span className="text-primary italic">Type something.</span>
          </h1>
        </div>

        <div className="mt-10">
          <DemoBrowser autoDemo chrome />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
          <CtaButton>Download Foleyard</CtaButton>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            local-first · no import · offline
          </p>
        </div>
      </section>

      <section className="px-6 pt-20 max-w-4xl mx-auto">
        <div className="divide-y divide-border border-y border-border">
          {[
            ["It's your files, exactly where they are", "Foleyard indexes drives in place. No import, no copy, no cloud."],
            ["Search is instant, everywhere", "One query reaches every indexed drive. Milliseconds, millions of files."],
            ["Preview before you play", "Waveforms render before you click. Favorites and playlists never move a file."],
          ].map(([t, d]) => (
            <div key={t} className="py-6 grid md:grid-cols-[1fr_1.5fr] gap-2 md:gap-8">
              <h3 className="font-bold">{t}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function VariantApp() {
  return (
    <div className="pb-24">
      <section className="px-4 md:px-10 pt-8 max-w-6xl mx-auto">
        <p className="pb-4 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          You're using Foleyard right now — no install, no signup
        </p>
        <DemoBrowser chrome />
      </section>

      <section className="px-6 pt-24 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter leading-[0.95]">
          That was 8 files.{" "}
          <span className="text-primary italic">
            Imagine all of them.
          </span>
        </h1>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          Foleyard indexes your actual drives — every SFX folder, music cue, and
          huge library — locally, in place, offline. Same search. Same speed.
          Your files.
        </p>
        <div className="mt-8">
          <CtaButton>Download Foleyard</CtaButton>
        </div>
      </section>
    </div>
  );
}

export function VariantOneBox() {
  return (
    <div className="pb-24">
      <section className="px-6 pt-28 max-w-3xl mx-auto text-center">
        <h1 className="text-6xl md:text-8xl font-serif font-bold tracking-tighter leading-[0.85]">
          <span className="text-primary italic">Type</span> a sound.
        </h1>
        <p className="mt-4 text-6xl md:text-8xl font-serif font-bold tracking-tighter leading-[0.85]">
          Hear it. <span className="text-primary italic">Done.</span>
        </p>

        <div className="mt-14 text-left">
          <DemoBrowser />
        </div>

        <p className="mt-10 text-muted-foreground leading-relaxed">
          This page just searched a pretend library in 3 ms. Foleyard searches
          all{" "}
          <span className="text-foreground font-semibold">
            1,284,312 real files on your drives
          </span>{" "}
          — locally, without moving any of them.
        </p>

        <div className="mt-8">
          <CtaButton>Download Foleyard</CtaButton>
        </div>
      </section>
    </div>
  );
}
