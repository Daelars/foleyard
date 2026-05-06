import { fetchQuery } from "convex/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { marked } from "marked";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { hasAdminRole } from "@/lib/clerk-admin";
import {
  FOUNDER_PROFILE_IMAGE,
  removeTeamBioLine,
  TEAM_MARKDOWN,
  useDefaultWhenLegacy,
} from "@/lib/site-defaults";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team - Foleyard",
  description: "Meet the people building Foleyard, the local-first sound library browser.",
};

const fallbackMembers = [
  {
    name: "Dalen (Dae)",
    role: "Founder & Lead Developer",
    bio: "Hi! I'm Dalen, or Dae. I'm the only member of the team currently, A bit about me, I love photography, video editing and coding! I also love a cheeky pint every so often.",
    imageUrl: FOUNDER_PROFILE_IMAGE,
    order: 0,
  },
];

export default async function TeamPage() {
  const user = await currentUser();
  const page = await fetchQuery(api.site.getPageBySlug, { slug: "team" });
  const teamMembers = await fetchQuery(api.site.listTeamMembers);
  const canEdit = hasAdminRole(user?.publicMetadata);

  const title = page?.title || "Currently built by one person.";
  const intro = removeTeamBioLine(useDefaultWhenLegacy(page?.content, TEAM_MARKDOWN));
  const htmlIntro = marked.parse(intro) as string;
  const members = teamMembers.length > 0 ? teamMembers : fallbackMembers;

  // Split title to highlight the last word
  const titleWords = title.split(" ");
  const lastWord = titleWords.pop();
  const titleStart = titleWords.join(" ");

  return (
    <div className="relative min-h-screen selection:bg-primary selection:text-primary-foreground">
      <div className="grain" />
      <div className="fixed inset-0 grid-pattern opacity-20 pointer-events-none" />

      <Navbar />

      <main className="relative z-10 py-24 px-6 md:px-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 hatch opacity-5 -translate-y-1/3 translate-x-1/3 pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <header className="mb-24 animate-reveal">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="w-12 h-px bg-primary" />
                <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
                  Team
                </span>
              </div>
              {canEdit && (
                <Link
                  href="/admin/site?page=team"
                  className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 transition-colors"
                >
                  Edit Team
                </Link>
              )}
            </div>

            <h1 className="text-5xl md:text-8xl font-serif font-bold leading-[0.85] tracking-tighter">
              {titleStart}{" "}
              <span className="text-primary italic glow-primary-sm">
                {lastWord}
              </span>
            </h1>
            <div
              className="mt-12 max-w-3xl prose prose-lg prose-invert
                prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tighter
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: htmlIntro }}
            />
          </header>

          <div className="animate-reveal [animation-delay:200ms]">
            <div className="grid gap-8 md:grid-cols-2">
              {members.map((member) => (
                <Card
                  key={`${member.order}-${member.name}`}
                  className="bg-background/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 corner-tick corner-tick-tr corner-tick-bl shadow-sm hover:shadow-glow/10 group"
                >
                  <CardHeader className="p-8">
                    <div className="flex items-start gap-6">
                      {member.imageUrl ? (
                        <div className="relative w-24 h-24 rounded-sm overflow-hidden border border-primary/20 shadow-lg shrink-0 group-hover:border-primary/40 transition-colors">
                          <img
                            src={member.imageUrl.replace(
                              "/about-me/profile_picture.png",
                              FOUNDER_PROFILE_IMAGE,
                            )}
                            alt={member.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center font-mono text-primary font-bold text-2xl shrink-0 group-hover:bg-primary/20 transition-colors">
                          {member.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-3xl font-serif font-bold tracking-tight mb-2 group-hover:text-primary transition-colors">
                          {member.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-[10px] text-primary font-bold uppercase tracking-widest">
                          {member.role}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-8 pb-8 pt-0">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {member.bio}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
