// Four variants of the marketing homepage, switchable via `?variant=` on the existing `/` route. Default (no param) = current design.
// PROTOTYPE — throwaway, do not ship to production. See skill: prototype UI sub-shape A.
import { Modal } from "@/components/modal";

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.25em]">
      {children}
    </span>
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
  playhead,
}: {
  seed: number;
  active?: boolean;
  playhead?: boolean;
}) {
  return (
    <div className="relative flex items-end gap-[2px] h-8">
      {wave(seed).map((h, i) => (
        <div
          key={i}
          style={{ height: `${h}px` }}
          className={`w-[2px] rounded-full ${
            active ? "bg-primary" : "bg-muted-foreground/40"
          }`}
        />
      ))}
      {playhead ? (
        <div className="absolute top-0 bottom-0 left-[38%] w-px bg-primary/70" />
      ) : null}
    </div>
  );
}

function FeatureStrip() {
  return (
    <div className="divide-y divide-border border-y border-border">
      {[
        {
          title: "Local-first indexing",
          desc: "Your drives, indexed in place. Nothing leaves the machine.",
        },
        {
          title: "Millisecond search",
          desc: "Millions of samples found as you type.",
        },
        {
          title: "Waveform preview",
          desc: "See the sound before you play it.",
        },
        {
          title: "Favorites & playlists",
          desc: "Curate without moving a single file.",
        },
      ].map((f, i) => (
        <div
          key={f.title}
          className="grid md:grid-cols-[80px_1fr_2fr] gap-2 md:gap-6 py-5 items-baseline"
        >
          <span className="font-mono text-xs text-muted-foreground">
            [{String(i + 1).padStart(2, "0")}]
          </span>
          <span className="font-bold">{f.title}</span>
          <span className="text-sm text-muted-foreground leading-relaxed">
            {f.desc}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VariantA() {
  return (
    <div className="pb-24">
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute -top-40 right-0 w-[600px] h-[600px] bg-primary/10 blur-[140px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-16 md:pt-24 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <Eyebrow>Foleyard v1 — available now</Eyebrow>
            <h1 className="mt-5 text-5xl md:text-7xl font-serif font-bold leading-[0.9] tracking-tighter">
              Every sound you own.{" "}
              <span className="text-primary italic">One search box away.</span>
            </h1>
            <p className="mt-6 text-xl text-muted-foreground leading-relaxed max-w-xl">
              A local-first browser for messy SFX folders, music cues, and
              massive audio libraries. No import. No cloud. No waiting.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <CtaButton>Download Foleyard</CtaButton>
              <a
                href="#how"
                className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                See it work ↓
              </a>
            </div>
          </div>

          <div className="lg:col-span-6 relative">
            <div className="border border-border rounded-2xl overflow-hidden shadow-2xl corner-tick corner-tick-tr corner-tick-bl">
              <img
                src="/app_preview.png"
                alt="Foleyard interface preview"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>

        <div className="relative mt-16 border-t border-border/60 bg-background/60 backdrop-blur-sm overflow-hidden">
          <div className="flex gap-8 px-6 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
            {[
              "footstep_gravel_01.wav",
              "whoosh_impact_heavy.wav",
              "bgm_tension_loop_c.wav",
              "rain_ext_medium.wav",
              "door_creak_long.wav",
              "impact_metal_hit_04.wav",
              "crowd_bar_murmur.wav",
              "jet_pass_by_distant.wav",
            ].map((n) => (
              <span key={n} className="flex items-center gap-2">
                <span className="w-1 h-1 bg-primary rounded-full" />
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="px-6 py-20 md:px-12 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <Modal
              trigger={
                <div className="relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl cursor-pointer">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover"
                  >
                    <source src="/launch_video.mp4" type="video/mp4" />
                  </video>
                  <div className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-widest text-white/50 bg-black/40 backdrop-blur-md px-2 py-1 rounded-sm border border-white/10">
                    Launch video
                  </div>
                </div>
              }
              src="/launch_video.mp4"
              type="video"
              alt="Launch video"
            />
          </div>
          <div className="lg:col-span-5">
            <Eyebrow>How it works</Eyebrow>
            <div className="mt-4 divide-y divide-border">
              {[
                [
                  "Type to search",
                  "Fuzzy matching across every file on every indexed drive.",
                ],
                [
                  "See before you play",
                  "Waveforms render instantly — no blind clicking.",
                ],
                [
                  "Curate in place",
                  "Favorites and playlists, files never move.",
                ],
              ].map(([t, d], i) => (
                <div key={t} className="py-5 flex gap-5">
                  <span className="font-mono text-xs text-primary pt-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-bold">{t}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <CtaButton>Download Foleyard</CtaButton>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8 md:px-12 max-w-7xl mx-auto">
        <FeatureStrip />
      </section>
    </div>
  );
}

export function VariantB() {
  const chapters = [
    {
      num: "01",
      name: "Index",
      body: "Point Foleyard at a folder. It walks your drives and indexes every file in place — no import, no copy, no cloud. Your library stays exactly where it is.",
      aside: "1,284,312 files on one drive",
    },
    {
      num: "02",
      name: "Search",
      body: "Type three letters. Every footstep, whoosh, and cue resolves in milliseconds. Fuzzy matching means typos still find the sound.",
      aside: "results before you lift the key",
    },
    {
      num: "03",
      name: "Preview",
      body: "High-resolution waveforms render before you click play. Hear it, see it, know it's the right take without scrubbing through players.",
      aside: "no external player, ever",
    },
    {
      num: "04",
      name: "Curate",
      body: "Favorites and playlists let you shape a working set out of a messy library — without moving a single file on disk.",
      aside: "0 files relocated",
    },
  ];

  return (
    <div className="pb-24">
      <section className="px-6 pt-24 pb-20 max-w-4xl mx-auto">
        <Eyebrow>A manifesto for people with too many sounds</Eyebrow>
        <h1 className="mt-5 text-5xl md:text-8xl font-serif font-bold leading-[0.88] tracking-tighter">
          Your library is not the problem.{" "}
          <span className="text-primary italic">Finding things is.</span>
        </h1>
        <p className="mt-8 text-xl text-muted-foreground leading-relaxed max-w-2xl">
          Foleyard is a local-first browser for messy SFX folders, music cues,
          and massive audio libraries. It doesn't reorganize your files — it
          makes them findable.
        </p>
        <div className="mt-10">
          <CtaButton>Download Foleyard</CtaButton>
        </div>
      </section>

      <section className="px-6 max-w-5xl mx-auto">
        {chapters.map((c) => (
          <div
            key={c.num}
            className="border-t border-border py-12 grid md:grid-cols-[1fr_2fr] gap-6 md:gap-16 relative"
          >
            <span className="hidden md:block absolute -top-2 right-0 text-8xl font-serif font-bold text-border select-none leading-none">
              {c.num}
            </span>
            <div>
              <span className="font-mono text-xs text-primary">{c.num} /</span>
              <h2 className="text-4xl font-serif font-bold tracking-tight">
                {c.name}
              </h2>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {c.aside}
              </p>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              {c.body}
            </p>
          </div>
        ))}
      </section>

      <section className="px-6 py-16 mt-8 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto">
          <p className="text-3xl md:text-5xl font-serif font-bold leading-tight tracking-tight">
            "The files were always fine. The finding was broken."
          </p>
        </div>
      </section>

      <section className="px-6 pt-16 pb-8 max-w-4xl mx-auto">
        <Eyebrow>Spec sheet</Eyebrow>
        <dl className="mt-6 border-t border-border text-sm">
          {[
            ["Platform", "Windows"],
            ["Where your audio lives", "Your drives. Unmoved."],
            ["Cloud dependency", "None. Fully offline."],
            ["Search speed", "Milliseconds over millions of files"],
            ["Source", "Open — github.com/Daelars/foleyard-v2"],
          ].map(([k, v]) => (
            <div
              key={k}
              className="grid grid-cols-[160px_1fr] gap-6 py-3 border-b border-border"
            >
              <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground pt-0.5">
                {k}
              </dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 text-center">
          <CtaButton>Download Foleyard</CtaButton>
        </div>
      </section>
    </div>
  );
}

export function VariantC() {
  const rows = [
    { name: "footstep_gravel_01.wav", dur: "0:03", seed: 1, sel: true },
    { name: "footstep_gravel_02.wav", dur: "0:02", seed: 2 },
    { name: "boot_scuff_dry_a.wav", dur: "0:04", seed: 3 },
    { name: "pebble_roll_medium.wav", dur: "0:06", seed: 4 },
    { name: "gravel_drag_slow.wav", dur: "0:05", seed: 5 },
  ];

  return (
    <div className="pb-24">
      <section className="px-4 md:px-10 pt-10 max-w-6xl mx-auto">
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
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded px-2 py-0.5">
                space = preview
              </span>
              <CtaButton>Download</CtaButton>
            </div>
          </div>

          <div className="grid md:grid-cols-[220px_1fr]">
            <div className="hidden md:block border-r border-border p-4 font-mono text-xs space-y-1.5">
              <p className="text-foreground font-bold uppercase tracking-wide">
                SFX/
              </p>
              <p className="pl-3 text-muted-foreground">Footsteps/</p>
              <p className="pl-6 bg-primary/10 text-primary rounded-sm px-1">
                Gravel/
              </p>
              <p className="pl-3 text-muted-foreground">Whooshes/</p>
              <p className="pl-3 text-muted-foreground">Impacts/</p>
              <p className="pl-3 text-muted-foreground">Ambience/</p>
              <p className="text-foreground font-bold uppercase tracking-wide pt-2">
                Music/
              </p>
              <p className="pl-3 text-muted-foreground">Cues/</p>
              <p className="pl-3 text-muted-foreground">Loops/</p>
              <div className="pt-4 mt-2 border-t border-border space-y-1.5">
                <p className="text-muted-foreground">♥ Favorites</p>
                <p className="text-muted-foreground">▤ Session 47</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 m-3 px-3 py-2 rounded-md border border-border bg-background font-mono text-sm">
                <span className="text-muted-foreground">⌕</span>
                <span>gravel</span>
                <span className="inline-block w-[2px] h-4 bg-primary animate-pulse" />
                <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-widest">
                  5 of 1,284,312 · 3 ms
                </span>
              </div>

              <div className="px-3 pb-3">
                {rows.map((r) => (
                  <div
                    key={r.name}
                    className={`flex items-center gap-4 px-3 py-2 rounded-md ${
                      r.sel
                        ? "bg-primary/10 border border-primary/30"
                        : "border border-transparent hover:bg-secondary/40"
                    }`}
                  >
                    <span className="font-mono text-xs text-primary w-4">▶</span>
                    <span
                      className={`font-mono text-xs truncate ${
                        r.sel ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span className="ml-auto hidden sm:block">
                      <Waveform seed={r.seed} active={r.sel} playhead={r.sel} />
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {r.dur}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 py-1.5 border-t border-border bg-secondary/50 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            1,284,312 files indexed · 3 ms · offline
          </div>
        </div>
      </section>

      <section className="px-6 pt-16 max-w-5xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter text-center leading-[0.95]">
          This is the whole pitch.{" "}
          <span className="text-primary italic">Try it on your library.</span>
        </h1>
        <p className="mt-5 text-center text-muted-foreground max-w-xl mx-auto">
          A local-first browser for messy SFX folders, music cues, and massive
          audio libraries.
        </p>

        <div className="mt-16 relative">
          <div className="absolute top-4 left-[16%] right-[16%] h-px bg-border" />
          <div className="grid sm:grid-cols-3 gap-10 relative">
            {[
              ["01", "Point it at a folder", "Any drive, any structure, any mess."],
              ["02", "It indexes locally", "Millions of files, nothing uploaded."],
              ["03", "Everything is playable", "Search, preview, favorite — instantly."],
            ].map(([n, t, d]) => (
              <div key={n} className="text-center">
                <div className="mx-auto w-9 h-9 rounded-full bg-background border-2 border-primary flex items-center justify-center font-mono text-xs font-bold text-primary shadow-glow">
                  {n}
                </div>
                <h3 className="mt-4 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 text-center pb-8">
          <CtaButton>Download Foleyard</CtaButton>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Open source · local-first · offline-ready
          </p>
        </div>
      </section>
    </div>
  );
}

export function VariantD() {
  const messPaths = [
    "C:\\Lib\\SFX\\new\\final\\final2\\USE THIS ONE\\gravel_wav\\",
    "C:\\Users\\mike\\Desktop\\sounds\\march dump\\footy steps\\",
    "D:\\projects\\horror_game\\audio\\TEMP - delete later\\steps\\",
    "E:\\backup_old\\old pc\\My Documents\\foley\\gravel (1)\\",
  ];

  const results = [
    { name: "footstep_gravel_01.wav", dur: "0:03", seed: 1, sel: true },
    { name: "boot_scuff_dry_a.wav", dur: "0:04", seed: 3 },
    { name: "pebble_roll_medium.wav", dur: "0:06", seed: 4 },
  ];

  return (
    <div className="pb-24">
      <section className="px-6 pt-20 pb-12 max-w-4xl mx-auto text-center">
        <Eyebrow>The honest comparison</Eyebrow>
        <h1 className="mt-5 text-5xl md:text-7xl font-serif font-bold leading-[0.9] tracking-tighter">
          Same files.{" "}
          <span className="text-primary italic">Different afternoon.</span>
        </h1>
      </section>

      <section className="px-4 md:px-10 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 border border-border rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Before — File Explorer
              </span>
              <span className="font-mono text-[10px] text-destructive">
                6 folders deep
              </span>
            </div>
            <div className="mt-5 space-y-3 font-mono text-[11px] leading-relaxed">
              {messPaths.map((p) => (
                <div
                  key={p}
                  className="flex items-start gap-2 text-muted-foreground"
                >
                  <span className="text-destructive/70">▸</span>
                  <span className="break-all">{p}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                opening folder 6 of 6… still looking
              </span>
            </div>
            <div className="mt-6 space-y-2">
              <div className="h-2 w-3/4 rounded bg-muted" />
              <div className="h-2 w-1/2 rounded bg-muted" />
              <div className="h-2 w-2/3 rounded bg-muted" />
            </div>
          </div>

          <div className="bg-card">
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  After — Foleyard
                </span>
                <span className="font-mono text-[10px] text-primary">
                  3 ms
                </span>
              </div>
              <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background font-mono text-sm">
                <span className="text-muted-foreground">⌕</span>
                <span>gravel</span>
                <span className="inline-block w-[2px] h-4 bg-primary animate-pulse" />
              </div>
              <div className="mt-3 space-y-1">
                {results.map((r) => (
                  <div
                    key={r.name}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md ${
                      r.sel
                        ? "bg-primary/10 border border-primary/30"
                        : "border border-transparent"
                    }`}
                  >
                    <span className="font-mono text-xs text-primary">▶</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {r.name}
                    </span>
                    <span className="ml-auto hidden sm:block">
                      <Waveform seed={r.seed} active={r.sel} />
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {r.dur}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                every gravel sound on every drive · one query
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pt-16 max-w-3xl mx-auto text-center">
        <p className="text-xl text-muted-foreground leading-relaxed">
          Foleyard indexes every drive you point it at — in place, locally,
          offline. Your mess stays your mess. You just never dig through it
          again.
        </p>
        <div className="mt-8">
          <CtaButton>Download Foleyard</CtaButton>
        </div>
        <p className="mt-12 pb-8 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Open source · local-first · offline-ready
        </p>
      </section>
    </div>
  );
}
