import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export function PageShell({
  children,
  mainClassName,
  beforeMain,
}: {
  children: React.ReactNode;
  mainClassName?: string;
  beforeMain?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      {beforeMain}

      <main
        className={
          mainClassName ? `relative z-10 ${mainClassName}` : "relative z-10"
        }
      >
        {children}
      </main>

      <Footer />
    </div>
  );
}
