import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foleyard - Find the right sound before the idea disappears",
  description:
    "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
