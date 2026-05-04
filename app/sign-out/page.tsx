import { SignOutButton } from "@clerk/nextjs";

export default function SignOutPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <SignOutButton redirectUrl="/"></SignOutButton>
    </main>
  );
}
