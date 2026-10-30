"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { renderMarkdown } from "@/lib/markdown";
import {
  AdminField,
  adminInputClass,
} from "@/components/admin-primitives";
import {
  defaultPageCopy,
  editablePageSlugs,
  isEditablePageSlug,
  type EditablePageSlug,
} from "@/components/admin-site-defaults";

export function usePageEditor(initialPageSlug?: string) {
  const [selectedPageSlug, setSelectedPageSlug] = useState<EditablePageSlug>(
    isEditablePageSlug(initialPageSlug) ? initialPageSlug : "about",
  );
  const [pageTitle, setPageTitle] = useState("");
  const [pageContent, setPageContent] = useState("");

  const pageData = useQuery(api.site.getPageBySlug, { slug: selectedPageSlug });
  const updatePage = useMutation(api.site.updatePage);
  const previewHtml = useMemo(() => renderMarkdown(pageContent), [pageContent]);

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

  const selectPage = (slug: EditablePageSlug) => {
    setSelectedPageSlug(slug);
    window.history.replaceState(null, "", `/admin/site?page=${slug}`);
  };

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

  return {
    selectedPageSlug,
    selectPage,
    pageTitle,
    setPageTitle,
    pageContent,
    setPageContent,
    pageData,
    previewHtml,
    handlePageSubmit,
  };
}

export type PageEditor = ReturnType<typeof usePageEditor>;

export function SitePagesTab({ editor }: { editor: PageEditor }) {
  const {
    selectedPageSlug,
    selectPage,
    pageTitle,
    setPageTitle,
    pageContent,
    setPageContent,
    pageData,
    previewHtml,
    handlePageSubmit,
  } = editor;

  return (
    <div className="space-y-8 animate-reveal">
      <div className="flex gap-2">
        {editablePageSlugs.map((slug) => (
          <button
            key={slug}
            onClick={() => selectPage(slug)}
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
        <AdminField label="Page Title">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => setPageTitle(e.target.value)}
            placeholder={pageData?.title || "Enter title..."}
            className={adminInputClass}
            required
          />
        </AdminField>

        <AdminField label="Content (Markdown)">
          <textarea
            value={pageContent}
            onChange={(e) => setPageContent(e.target.value)}
            placeholder={pageData?.content || "Enter content..."}
            className={`${adminInputClass} font-mono text-sm`}
            rows={15}
            required
          />
        </AdminField>

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
  );
}
