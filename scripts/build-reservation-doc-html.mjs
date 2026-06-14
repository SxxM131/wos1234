#!/usr/bin/env node
/**
 * Builds docs/RESERVATION_SYSTEM.html from RESERVATION_SYSTEM.md
 * Mobile-friendly HTML with Mermaid diagram rendering.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const mdPath = resolve(root, "docs/RESERVATION_SYSTEM.md");
const outPath = resolve(root, "docs/RESERVATION_SYSTEM.html");

const md = readFileSync(mdPath, "utf8");

const renderer = new marked.Renderer();
const originalCode = renderer.code.bind(renderer);
renderer.code = function (code, infostring, escaped) {
  const lang = (infostring || "").trim().toLowerCase();
  if (lang === "mermaid") {
    return `<pre class="mermaid" translate="no">${code.replace(/</g, "&lt;")}</pre>`;
  }
  return originalCode(code, infostring, escaped);
};

marked.setOptions({
  renderer,
  gfm: true,
  breaks: false,
});

const bodyHtmlRaw = marked.parse(md);

const bodyHtml = bodyHtmlRaw
  .replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_, code) => {
      const decoded = code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
      return `<pre class="mermaid" translate="no">${decoded}</pre>`;
    }
  )
  .replace(/<code>/g, '<code translate="no">');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#2563eb" />
  <title>SVS 예약 시스템 — 기술 문서</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
      --muted: #64748b;
      --border: #e2e8f0;
      --link: #2563eb;
      --code-bg: #f1f5f9;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.65;
      color: var(--text);
      background: var(--bg);
      -webkit-text-size-adjust: 100%;
    }
    .wrap {
      max-width: 42rem;
      margin: 0 auto;
      padding: 1rem 1rem 3rem;
    }
    header.doc-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(248, 250, 252, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1rem;
      margin: -1rem -1rem 1.25rem;
    }
    header.doc-header h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
    }
    header.doc-header p {
      margin: 0.25rem 0 0;
      font-size: 0.8rem;
      color: var(--muted);
    }
    article h1 { font-size: 1.5rem; margin-top: 2rem; border-bottom: 2px solid var(--border); padding-bottom: 0.35rem; }
    article h2 { font-size: 1.25rem; margin-top: 1.75rem; }
    article h3 { font-size: 1.05rem; margin-top: 1.25rem; }
    article p, article li { word-break: break-word; }
    article a { color: var(--link); }
    article hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    article blockquote {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      border-left: 4px solid var(--link);
      background: var(--card);
      border-radius: 0 0.5rem 0.5rem 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
    article table {
      display: block;
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-collapse: collapse;
      font-size: 0.875rem;
      margin: 1rem 0;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
    }
    article th, article td {
      border: 1px solid var(--border);
      padding: 0.5rem 0.65rem;
      text-align: left;
      vertical-align: top;
      min-width: 5rem;
    }
    article th { background: #f1f5f9; font-weight: 600; white-space: nowrap; }
    article code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85em;
      background: var(--code-bg);
      padding: 0.12em 0.35em;
      border-radius: 0.25rem;
    }
    article pre:not(.mermaid) {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      background: #0f172a;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      line-height: 1.5;
    }
    article pre:not(.mermaid) code {
      background: none;
      padding: 0;
      color: inherit;
    }
    pre.mermaid {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem 0.5rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 1rem 0;
      text-align: center;
    }
    details {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      margin: 1rem 0;
    }
    details summary { cursor: pointer; font-weight: 600; }
    @media (max-width: 480px) {
      body { font-size: 15px; }
      article h1 { font-size: 1.35rem; }
      article table { font-size: 0.8rem; }
    }
    @media print {
      header.doc-header { position: static; }
      pre.mermaid { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="doc-header">
      <h1>SVS 예약 시스템</h1>
      <p>기술 문서 · RESERVATION_SYSTEM.md에서 생성</p>
    </header>
    <article id="content">
${bodyHtml}
    </article>
  </div>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({
      startOnLoad: true,
      theme: "default",
      securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
      er: { useMaxWidth: true },
    });
  </script>
</body>
</html>
`;

writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath}`);
