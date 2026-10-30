import Link from "next/link";

const EDIT_LINK_CLASS =
  "px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 transition-colors";

export function PageHeader({
  label,
  title,
  editHref,
  editLabel = "Edit Page",
  wrap = false,
  titleSpacing = false,
  className = "mb-16 animate-reveal",
  children,
}: {
  label: string;
  title: string;
  editHref?: string;
  editLabel?: string;
  wrap?: boolean;
  titleSpacing?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  // Split title to highlight the last word
  const titleWords = title.split(" ");
  const lastWord = titleWords.pop();
  const titleStart = titleWords.join(" ");

  return (
    <header className={className}>
      <div
        className={
          wrap
            ? "flex items-center justify-between flex-wrap gap-4 mb-8"
            : "flex items-center justify-between gap-4 mb-8"
        }
      >
        <div className="flex items-center gap-3">
          <span className="w-12 h-px bg-primary" />
          <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
            {label}
          </span>
        </div>
        {editHref && (
          <Link href={editHref} className={EDIT_LINK_CLASS}>
            {editLabel}
          </Link>
        )}
      </div>

      <h1
        className={`text-5xl md:text-8xl font-serif font-bold leading-[0.85] tracking-tighter${
          titleSpacing ? " mb-8" : ""
        }`}
      >
        {titleStart}{" "}
        <span className="text-primary italic glow-primary-sm">{lastWord}</span>
      </h1>

      {children}
    </header>
  );
}
