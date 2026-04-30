import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaitlistForm } from "@/components/waitlist-form";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />

      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-8 md:px-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center font-bold text-primary-foreground glow-primary">
            S
          </div>
          <span className="text-xl font-bold tracking-tighter uppercase font-mono">
                Foleyard
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline-flex px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-primary/30 text-primary rounded-full">
            Coming soon
          </span>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="px-6 pt-12 pb-24 md:px-12 md:pt-24 lg:pt-32 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-reveal">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl font-serif font-bold leading-[0.9] tracking-tighter">
                  Find the right sound before the{" "}
                  <span className="text-primary italic glow-primary-sm">
                    idea disappears.
                  </span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-[500px] leading-relaxed">
                  A local-first browser for messy SFX folders, music cues, and
                  massive audio libraries.
                </p>
              </div>

              <WaitlistForm />

              <div className="flex items-center gap-6 pt-4 text-xs font-mono text-muted-foreground uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full glow-primary-sm" />
                  Local-First
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full glow-primary-sm" />
                  Ultra Fast
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full glow-primary-sm" />
                  Offline-Ready
                </div>
              </div>
            </div>

            <div className="relative group animate-reveal [animation-delay:200ms]">
              <div className="absolute -inset-4 border border-border/50 rounded-3xl hatch opacity-20 group-hover:opacity-30 transition-opacity" />
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl corner-tick corner-tick-tl corner-tick-br">
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
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-widest text-white/50 bg-black/40 backdrop-blur-md px-2 py-1 rounded-sm border border-white/10">
                  Launch video
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-24 md:px-12 bg-secondary/30 border-y border-border relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 hatch opacity-5 -translate-y-1/2 translate-x-1/2" />

          <div className="max-w-7xl mx-auto space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-2">
                <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
                  Capabilities
                </span>
                <h2 className="text-4xl font-serif font-bold tracking-tight">
                  Built for messy sound libraries.
                </h2>
              </div>
              <p className="text-muted-foreground max-w-md font-sans text-sm md:text-base leading-relaxed">
                Stop digging through nested folders. Foleyard indexes your
                local drives and makes everything instantly searchable and
                playable.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: "Local-first indexing",
                  desc: "No cloud sync. Your data stays on your machine.",
                  tag: "SECURE",
                },
                {
                  title: "Fast folder search",
                  desc: "Scan millions of samples in milliseconds.",
                  tag: "PERF",
                },
                {
                  title: "Waveform preview",
                  desc: "See the sound before you click play.",
                  tag: "VISUAL",
                },
                {
                  title: "Favorites & Playlists",
                  desc: "Curate your library without moving files.",
                  tag: "ORG",
                },
              ].map((f, i) => (
                <Card
                  key={i}
                  className="bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors group"
                >
                  <CardHeader className="p-5 border-none">
                    <CardDescription className="flex justify-between items-center mb-2">
                      <span>[{String(i + 1).padStart(2, "0")}]</span>
                      <span className="text-[10px] border border-border px-1.5 py-0.5 rounded-sm group-hover:border-primary/30 group-hover:text-primary transition-colors">
                        {f.tag}
                      </span>
                    </CardDescription>
                    <CardTitle className="text-lg font-sans font-bold">
                      {f.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 pt-0">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 md:px-12 max-w-7xl mx-auto overflow-hidden">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <h2 className="text-4xl font-serif font-bold tracking-tight">
                Clean UI for{" "}
                <span className="text-primary italic">messy workflows.</span>
              </h2>
              <div className="space-y-4">
                {[
                  "Folder sidebar with deep tree navigation",
                  "Global search bar with fuzzy matching",
                  "High-resolution waveform viewer",
                  "One-click favorites and tagging",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="mt-1.5 w-4 h-px bg-primary group-hover:w-6 transition-all" />
                    <span className="text-sm font-mono uppercase tracking-wide group-hover:text-foreground transition-colors">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 relative">
              <div className="absolute inset-0 bg-primary/10 blur-[100px] opacity-20 pointer-events-none" />
              <div className="relative border border-border rounded-2xl bg-card p-1 shadow-2xl corner-tick corner-tick-tr corner-tick-bl overflow-hidden">
                <img
                  src="/app_preview.png"
                  alt="Foleyard interface preview"
                  className="w-full h-auto rounded-xl"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-6 py-12 md:px-12 border-t border-border mt-12 bg-card">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-foreground text-background rounded-sm flex items-center justify-center font-bold text-xs">
                S
              </div>
              <span className="font-bold tracking-tighter uppercase font-mono text-sm">
                Foleyard
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.2em]">
              © 2026 Foleyard // Local-first audio browsing.
            </p>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Built for editors, sound designers, and creators with large local libraries.
          </p>
        </div>
      </footer>
    </div>
  );
}
