"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/admin-primitives";
import { SitePagesTab, usePageEditor } from "@/components/admin-site-pages-tab";
import { SiteTeamTab, useTeamEditor } from "@/components/admin-site-team-tab";

export function AdminSiteClient({
  initialPageSlug,
}: {
  initialPageSlug?: string;
}) {
  const [activeTab, setActiveTab] = useState<"pages" | "team">("pages");
  const pageEditor = usePageEditor(initialPageSlug);
  const teamEditor = useTeamEditor();

  return (
    <div className="max-w-4xl mx-auto">
      <AdminHeader eyebrow="Site Control" title="Site" accent="Manager." />

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

      {activeTab === "pages" && <SitePagesTab editor={pageEditor} />}

      {activeTab === "team" && <SiteTeamTab editor={teamEditor} />}
    </div>
  );
}
