import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { renderMarkdown } from "@/lib/markdown";
import { FOUNDER_PROSE_CLASS, PROSE_CLASS } from "@/lib/prose";

export function CmsPage({
  title,
  label,
  content,
  canEdit,
  editHref,
  editLabel,
  articleClassName = "max-w-4xl mx-auto",
  wrap = false,
  titleSpacing = false,
  variant = "framed",
}: {
  title: string;
  label: string;
  content: string;
  canEdit: boolean;
  editHref: string;
  editLabel?: string;
  articleClassName?: string;
  wrap?: boolean;
  titleSpacing?: boolean;
  variant?: "framed" | "founder";
}) {
  const htmlContent = renderMarkdown(content);

  return (
    <PageShell mainClassName="py-24 px-6 md:px-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 hatch opacity-5 -translate-y-1/3 translate-x-1/3 pointer-events-none" />

        <article className={articleClassName}>
          <PageHeader
            label={label}
            title={title}
            editHref={canEdit ? editHref : undefined}
            editLabel={editLabel}
            wrap={wrap}
            titleSpacing={titleSpacing}
          />

          {variant === "framed" ? (
            <div className="animate-reveal [animation-delay:200ms] relative">
              <div className="absolute -inset-8 border border-border/30 rounded-2xl pointer-events-none corner-tick corner-tick-tl corner-tick-br opacity-50" />
              <div
                className={PROSE_CLASS}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>
          ) : (
            <div
              className={`animate-reveal [animation-delay:200ms] ${FOUNDER_PROSE_CLASS}`}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
        </article>
    </PageShell>
  );
}
