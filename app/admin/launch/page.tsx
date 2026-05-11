import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AdminLaunchClient } from "@/components/admin-launch-client";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { hasAdminRole } from "@/lib/clerk-admin";

export const dynamic = "force-dynamic";

export default async function AdminLaunchPage() {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;

  if (userId && !hasAdminRole(user?.publicMetadata)) {
    notFound();
  }

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-12 px-6 md:px-12">
        {!userId ? (
          <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center rounded-2xl border border-border/50 bg-card/50 p-8 text-center shadow-xl backdrop-blur-sm">
            <p className="mb-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Admin access
            </p>
            <h1 className="mb-4 text-4xl font-serif font-bold tracking-tighter">
              Sign in to launch.
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              Only Clerk users with the admin role can access the launch panel.
            </p>
            <SignInButton mode="modal">
              <button className="rounded-sm bg-primary px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground glow-primary transition-transform hover:scale-[1.02] active:scale-[0.98]">
                Sign in
              </button>
            </SignInButton>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-8 flex max-w-4xl items-center justify-end gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <span>Signed in</span>
              <UserButton />
            </div>
            <AdminLaunchClient />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
