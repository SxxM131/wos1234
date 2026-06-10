import { marked } from "marked";

/** Convert markdown to HTML with Mermaid blocks ready for client-side rendering. */
export function markdownToHtml(markdown: string): string {
  const raw = marked.parse(markdown, { gfm: true, breaks: false }) as string;

  return raw.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_, code: string) => {
      const decoded = code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
      return `<pre class="mermaid">${decoded}</pre>`;
    }
  );
}
