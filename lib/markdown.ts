import { Marked } from "marked";

const SAFE_SCHEME = /^(https?|mailto|tel):/i;

// Allow http(s)/mailto/tel and scheme-less (relative) URLs; reject anything else with a scheme.
function isSafeUrl(href: string) {
  const url = href.replace(/[\u0000- ]/g, "");
  if (SAFE_SCHEME.test(url)) return true;
  return !/^[^/?#]*:/.test(url);
}

const markdown = new Marked({
  renderer: {
    // Drop raw HTML so CMS content cannot inject script tags or handlers.
    html() {
      return "";
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!isSafeUrl(href)) return text;
      const t = title ? ` title="${escapeAttr(title)}"` : "";
      return `<a href="${escapeAttr(href)}"${t}>${text}</a>`;
    },
    image({ href, title, text }) {
      if (!isSafeUrl(href)) return "";
      const t = title ? ` title="${escapeAttr(title)}"` : "";
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${t}>`;
    },
  },
});

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
