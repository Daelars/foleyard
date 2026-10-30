import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/team", label: "Team" },
  { href: "/founder", label: "Founder" },
  { href: "/contact", label: "Contact" },
];

const linkClassName =
  "font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors";

const mobileLinks = links.slice(0, 4);

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
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClassName}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="md:hidden flex flex-wrap items-center justify-end gap-x-4 gap-y-2 max-w-[200px]">
          {mobileLinks.map((link) => (
            <Link key={link.href} href={link.href} className={linkClassName}>
              {link.label}
            </Link>
          ))}
        </div>
        <Link
          href="https://github.com/Daelars/foleyard-v2/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-primary/30 text-primary rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          Available now
        </Link>
      </div>
    </nav>
  );
}
