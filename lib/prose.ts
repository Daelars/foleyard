const PROSE_BASE =
  "prose prose-lg prose-invert max-w-none prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tighter prose-p:text-muted-foreground prose-p:leading-relaxed prose-strong:text-foreground prose-strong:font-bold prose-a:text-primary prose-a:no-underline hover:prose-a:underline";

const PROSE_CODE =
  "prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none";

export const PROSE_CLASS = `${PROSE_BASE} prose-img:rounded-xl prose-img:border prose-img:border-border ${PROSE_CODE}`;

export const FOUNDER_PROSE_CLASS = `${PROSE_BASE} prose-img:mx-0 prose-img:h-48 prose-img:w-48 prose-img:rounded-sm prose-img:border prose-img:border-border prose-img:object-cover ${PROSE_CODE}`;
