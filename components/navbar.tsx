import Link from "next/link";

export function Navbar() {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 py-8 md:px-12">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center font-bold text-primary-foreground glow-primary group-hover:scale-105 transition-transform">
            FY
          </div>
          <span className="text-xl font-bold tracking-tighter uppercase font-mono">
            Foleyard
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
          >
            Home
          </Link>
          <Link
            href="/blog"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
          >
            Blog
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="md:hidden flex items-center gap-4">
          <Link
            href="/"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
          >
            Home
          </Link>
          <Link
            href="/blog"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
          >
            Blog
          </Link>
        </div>
        <span className="hidden md:inline-flex px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-primary/30 text-primary rounded-full">
          Coming soon
        </span>
      </div>
    </nav>
  );
}
