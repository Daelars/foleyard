import { describe, expect, test } from "bun:test";

import { renderMarkdown } from "../lib/markdown";

describe("renderMarkdown removes unsafe content", () => {
  test.each([
    ["block script tag", "<script>alert(1)</script>"],
    ["inline script tag", "Hello <script>alert(1)</script> world"],
    ["script tag with attributes", '<script src="https://evil.example/x.js"></script>'],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["style tag", "<style>body{display:none}</style>"],
  ])("%s", (_name, source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/<script|<iframe|<style/i);
  });

  test.each([
    ["img onerror", '<img src="x" onerror="alert(1)">'],
    ["inline img onerror", 'Text <img src=x onerror=alert(1)> text'],
    ["div onclick", '<div onclick="alert(1)">click</div>'],
    ["svg onload", "<svg onload=alert(1)></svg>"],
    ["a onmouseover", '<a href="/ok" onmouseover="alert(1)">hover</a>'],
  ])("event handler: %s", (_name, source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  test("escapes a quote in an image title so it cannot add an attribute", () => {
    const html = renderMarkdown('![alt](/a.png "x\\" onerror=\\"alert(1)")');
    expect(html).not.toMatch(/"\s*onerror=/i);
    expect(html).toContain("&quot;");
  });

  test.each([
    ["javascript: link", "[click](javascript:alert(1))"],
    ["upper-case javascript: link", "[click](JaVaScRiPt:alert(1))"],
    ["javascript: link with leading space", "[click](< javascript:alert(1)>)"],
    ["javascript: link with a tab in the scheme", "[click](<java\tscript:alert(1)>)"],
    ["vbscript: link", "[click](vbscript:msgbox(1))"],
    ["data: link", "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["javascript: reference link", "[click][x]\n\n[x]: javascript:alert(1)"],
    ["javascript: autolink", "<javascript:alert(1)>"],
  ])("drops the link for a %s", (_name, source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/<a\s/i);
  });

  test("escapes an entity-encoded scheme so the browser cannot decode it", () => {
    const html = renderMarkdown("[click](&#106;avascript:alert(1))");
    expect(html).toContain('href="&amp;#106;avascript:alert(1)"');
  });

  test.each([
    ["javascript: image", "![x](javascript:alert(1))"],
    ["data: image", "![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)"],
  ])("drops a %s", (_name, source) => {
    const html = renderMarkdown(source);
    expect(html).not.toMatch(/<img/i);
  });

  test("keeps the text of a dropped link", () => {
    expect(renderMarkdown("[click me](javascript:alert(1))")).toContain("click me");
  });
});

describe("renderMarkdown keeps safe links", () => {
  test.each([
    "/blog/hello-world",
    "../about",
    "docs/getting-started",
    "#features",
    "?ref=home",
    "/search?q=a:b",
    "https://foleyard.com/download",
    "http://example.com",
    "mailto:hello@example.com",
    "tel:+15555550100",
  ])("%s", (href) => {
    const html = renderMarkdown(`[link](${href})`);
    expect(html).toContain(`<a href="${href}">link</a>`);
  });

  test("keeps a link title", () => {
    expect(renderMarkdown('[link](/a "Title")')).toContain(
      '<a href="/a" title="Title">link</a>',
    );
  });

  test("keeps a relative image", () => {
    expect(renderMarkdown("![Logo](/logo.png)")).toContain(
      '<img src="/logo.png" alt="Logo">',
    );
  });
});

describe("renderMarkdown keeps normal formatting", () => {
  test("headings, emphasis and paragraphs", () => {
    const html = renderMarkdown("# Title\n\n## Sub\n\nSome **bold** and *italic* text.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Sub</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<p>");
  });

  test("lists", () => {
    const html = renderMarkdown("- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>second</li>");
  });

  test("code and blockquotes", () => {
    const html = renderMarkdown("Use `bun test`.\n\n```\nconst a = 1;\n```\n\n> quote");
    expect(html).toContain("<code>bun test</code>");
    expect(html).toContain("<pre><code>const a = 1;\n</code></pre>");
    expect(html).toContain("<blockquote>");
  });

  test("escapes HTML inside code instead of dropping it", () => {
    const html = renderMarkdown("`<script>alert(1)</script>`");
    expect(html).toContain("<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>");
  });
});
