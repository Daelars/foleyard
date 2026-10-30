import type { ReactNode } from "react";

export const adminLabelClass =
  "block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground";

export const adminInputClass =
  "w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all";

export function AdminField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className={adminLabelClass}>{label}</label>
      {children}
    </div>
  );
}

export function AdminHeader({
  eyebrow,
  title,
  accent,
}: {
  eyebrow: string;
  title: string;
  accent: string;
}) {
  return (
    <header className="mb-12 animate-reveal">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-12 h-px bg-primary" />
        <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
          {eyebrow}
        </span>
      </div>
      <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter">
        {`${title} `}
        <span className="text-primary italic">{accent}</span>
      </h1>
    </header>
  );
}

export function AdminListRow({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-6 bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl group hover:border-primary/30 transition-all">
      <div>
        <h3 className="font-serif font-bold text-lg group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
          {subtitle}
        </p>
      </div>
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
