import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative z-10 px-6 py-12 md:px-12 border-t border-border mt-12 bg-card">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground text-background rounded-sm flex items-center justify-center font-bold text-xs">
              FY
            </div>
            <span className="font-bold tracking-tighter uppercase font-mono text-sm">
              Foleyard
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.2em]">
            © 2026 Foleyard // Local-first audio browsing.
          </p>
        </div>

        <div className="flex gap-8 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <Link href="/about" className="hover:text-primary transition-colors">About</Link>
          <Link href="/team" className="hover:text-primary transition-colors">Team</Link>
          <Link href="/founder" className="hover:text-primary transition-colors">Founder</Link>
          <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
        </div>

        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Built for editors, sound designers, and creators with large local libraries.
        </p>
      </div>
    </footer>
  );
}
