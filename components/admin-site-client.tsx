"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { marked } from "marked";
import {
  ABOUT_MARKDOWN,
  ABOUT_PAGE_MARKDOWN,
  CONTACT_MARKDOWN,
  FOUNDER_PROFILE_IMAGE,
  FOUNDER_MARKDOWN,
  TEAM_MARKDOWN,
} from "@/lib/site-defaults";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const editablePageSlugs = ["about", "founder", "founders", "team", "contact"] as const;
type EditablePageSlug = (typeof editablePageSlugs)[number];

function isEditablePageSlug(value: string | null | undefined): value is EditablePageSlug {
  return editablePageSlugs.includes(value as EditablePageSlug);
}

const defaultPageCopy: Record<EditablePageSlug, { title: string; content: string }> = {
  about: {
    title: "Foleyard: A Local-First Browser for Your Sound Library",
    content: ABOUT_PAGE_MARKDOWN,
  },
  founder: {
    title: "Why I Built Foleyard",
    content: FOUNDER_MARKDOWN,
  },
  founders: {
    title: "Why I Built Foleyard",
    content: FOUNDER_MARKDOWN,
  },
  team: {
    title: "Currently built by one person.",
    content: TEAM_MARKDOWN,
  },
  contact: {
    title: "Get in Touch",
    content: CONTACT_MARKDOWN,
  },
};

export function AdminSiteClient({
  initialPageSlug,
}: {
  initialPageSlug?: string;
}) {
  const [activeTab, setActiveTab] = useState<"pages" | "team">("pages");
  
  // Page State
  const [selectedPageSlug, setSelectedPageSlug] = useState<EditablePageSlug>(
    isEditablePageSlug(initialPageSlug) ? initialPageSlug : "about",
  );
  const [pageTitle, setPageTitle] = useState("");
  const [pageContent, setPageContent] = useState("");
  
  // Team State
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberBio, setMemberBio] = useState("");
  const [memberImageUrl, setMemberImageUrl] = useState("");
  const [memberOrder, setMemberOrder] = useState(0);
  const [editingMemberId, setEditingMemberId] = useState<Id<"teamMembers"> | null>(null);

  const pageData = useQuery(api.site.getPageBySlug, { slug: selectedPageSlug });
  const teamMembers = useQuery(api.site.listTeamMembers);
  
  const updatePage = useMutation(api.site.updatePage);
  const upsertTeamMember = useMutation(api.site.upsertTeamMember);
  const deleteTeamMember = useMutation(api.site.deleteTeamMember);
  const seedInitialData = useMutation(api.site.seedInitialData);
  const previewHtml = useMemo(() => marked.parse(pageContent) as string, [pageContent]);

  const handleSeed = async () => {
    if (!confirm("Initialize site with Dalen's profile and default content?")) return;
    try {
      await seedInitialData({
        aboutContent: defaultPageCopy.about.content,
        founderBio: defaultPageCopy.founder.content,
        foundersContent: defaultPageCopy.founders.content,
        teamContent: defaultPageCopy.team.content,
        contactContent: defaultPageCopy.contact.content,
        founderImageUrl: FOUNDER_PROFILE_IMAGE,
      });
      alert("Site initialized!");
    } catch (error) {
      console.error(error);
      alert("Error seeding data");
    }
  };

  useEffect(() => {
    if (pageData) {
      setPageTitle(pageData.title);
      setPageContent(pageData.content);
      return;
    }
    const fallback = defaultPageCopy[selectedPageSlug];
    setPageTitle(fallback.title);
    setPageContent(fallback.content);
  }, [pageData, selectedPageSlug]);

  const handlePageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePage({
        slug: selectedPageSlug,
        title: pageTitle,
        content: pageContent,
      });
      alert("Page updated successfully");
    } catch (error) {
      console.error(error);
      alert("Error updating page");
    }
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertTeamMember({
        id: editingMemberId ?? undefined,
        name: memberName,
        role: memberRole,
        bio: memberBio,
        imageUrl: memberImageUrl || null,
        order: memberOrder,
      });
      resetTeamForm();
    } catch (error) {
      console.error(error);
      alert("Error saving team member");
    }
  };

  const resetTeamForm = () => {
    setMemberName("");
    setMemberRole("");
    setMemberBio("");
    setMemberImageUrl("");
    setMemberOrder(0);
    setEditingMemberId(null);
  };

  const handleEditMember = (member: Doc<"teamMembers">) => {
    setMemberName(member.name);
    setMemberRole(member.role);
    setMemberBio(member.bio);
    setMemberImageUrl(member.imageUrl || "");
    setMemberOrder(member.order);
    setEditingMemberId(member._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-12 animate-reveal">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-12 h-px bg-primary" />
          <span className="font-mono text-xs text-primary font-bold uppercase tracking-[0.2em]">
            Site Control
          </span>
        </div>
        <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tighter">
          Site <span className="text-primary italic">Manager.</span>
        </h1>
      </header>

      <div className="flex gap-4 mb-8 font-mono text-xs uppercase tracking-widest">
        <button
          onClick={() => setActiveTab("pages")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "pages"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pages
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "team"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Team
        </button>
      </div>

      {activeTab === "pages" && (
        <div className="space-y-8 animate-reveal">
          <div className="flex gap-2">
            {editablePageSlugs.map((slug) => (
              <button
                key={slug}
                onClick={() => {
                  setSelectedPageSlug(slug);
                  window.history.replaceState(null, "", `/admin/site?page=${slug}`);
                }}
                className={`px-4 py-2 rounded-sm border font-mono text-[10px] uppercase tracking-widest transition-all ${
                  selectedPageSlug === slug
                    ? "bg-primary text-primary-foreground border-primary glow-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                }`}
              >
                {slug}
              </button>
            ))}
          </div>

          <form onSubmit={handlePageSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <div className="space-y-6 p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-sm corner-tick corner-tick-tr corner-tick-bl shadow-xl">
            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Page Title
              </label>
              <input
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                placeholder={pageData?.title || "Enter title..."}
                className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Content (Markdown)
              </label>
              <textarea
                value={pageContent}
                onChange={(e) => setPageContent(e.target.value)}
                placeholder={pageData?.content || "Enter content..."}
                className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
                rows={15}
                required
              />
            </div>

            <button
              type="submit"
              className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
            >
              Update {selectedPageSlug} Page
            </button>
            </div>

            <aside className="space-y-4 p-8 bg-background/50 backdrop-blur-sm border border-border/50 rounded-sm">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Live Preview
                </p>
                <h2 className="mt-2 text-2xl font-serif font-bold tracking-tight">
                  {pageTitle || defaultPageCopy[selectedPageSlug].title}
                </h2>
              </div>
              <div
                className="prose prose-sm prose-invert max-w-none
                  prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tighter
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-img:rounded-sm prose-img:border prose-img:border-border"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </aside>
          </form>
        </div>
      )}

      {activeTab === "team" && (
        <div className="space-y-12 animate-reveal">
          <form
            onSubmit={handleTeamSubmit}
            className="space-y-6 p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl corner-tick corner-tick-tr corner-tick-bl shadow-xl"
          >
            <h2 className="text-2xl font-serif font-bold tracking-tight mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full glow-primary-sm" />
              {editingMemberId ? "Edit Member" : "New Member"}
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  Role
                </label>
                <input
                  type="text"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Bio
              </label>
              <textarea
                value={memberBio}
                onChange={(e) => setMemberBio(e.target.value)}
                className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                rows={3}
                required
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  Image URL (optional)
                </label>
                <input
                  type="text"
                  value={memberImageUrl}
                  onChange={(e) => setMemberImageUrl(e.target.value)}
                  className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                  Display Order
                </label>
                <input
                  type="number"
                  value={memberOrder}
                  onChange={(e) => setMemberOrder(parseInt(e.target.value) || 0)}
                  className="w-full p-3 bg-background/50 border border-border rounded-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
              >
                {editingMemberId ? "Update Member" : "Add Member"}
              </button>
              {editingMemberId && (
                <button
                  type="button"
                  onClick={resetTeamForm}
                  className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-primary/50 hover:text-primary transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="space-y-6">
            <h2 className="text-2xl font-serif font-bold tracking-tight border-b border-border/50 pb-4">
              Team Roster
            </h2>
            {!teamMembers ? (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground animate-pulse">
                Loading roster...
              </p>
            ) : teamMembers.length === 0 ? (
              <div className="p-12 border border-dashed border-border rounded-2xl text-center space-y-4">
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest italic">
                  The roster is currently empty.
                </p>
                <button
                  onClick={handleSeed}
                  className="px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-sm font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all"
                >
                  Initialize with Dalen's Profile
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {teamMembers.map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between p-6 bg-card/30 backdrop-blur-sm border border-border/50 rounded-xl group hover:border-primary/30 transition-all"
                  >
                    <div>
                      <h3 className="font-serif font-bold text-lg group-hover:text-primary transition-colors">
                        {member.name}
                      </h3>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                        {member.role} (Order: {member.order})
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleEditMember(member)}
                        className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 hover:text-primary transition-all"
                      >
                        Modify
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this member?")) {
                            deleteTeamMember({ id: member._id });
                          }
                        }}
                        className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-destructive hover:text-destructive transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
