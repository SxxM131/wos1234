import { marked } from "marked";

function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Convert markdown to HTML with Mermaid blocks ready for client-side rendering. */
export function markdownToHtml(markdown: string): string {
  const raw = marked.parse(markdown, { gfm: true, breaks: false }) as string;

  const withMermaid = raw.replace(
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

  return withMermaid.replace(/<h1>([\s\S]*?)<\/h1>/g, (_, inner: string) => {
    const id = slugifyHeading(inner);
    return id ? `<h1 id="${id}">${inner}</h1>` : `<h1>${inner}</h1>`;
  });
}
