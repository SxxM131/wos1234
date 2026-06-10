import { readFileSync } from "fs";
import { join } from "path";
import { markdownToHtml } from "./markdown-to-html";

const docsDir = join(process.cwd(), "docs");

/** Rewrite doc-relative links for in-app /admin/guide/* routes (GitHub-relative paths 404 on Vercel). */
export function rewriteDocLinksForWeb(markdown: string): string {
  return markdown
    .replace(/\]\(RESERVATION_SYSTEM\.md\)/g, "](/admin/guide/ko)")
    .replace(/\]\(RESERVATION_SYSTEM_EN\.html\)/g, "](/admin/guide/mobile)")
    .replace(/\]\(RESERVATION_SYSTEM_EN\.md\)/g, "](/admin/guide)")
    .replace(
      /\]\(\.\.\/README\.md[^)]*\)/g,
      "](https://github.com/SxxM131/wos1234#-%EC%9A%B4%EC%98%81-%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4-%EC%9A%94%EC%95%BD)"
    );
}

export function rewriteMobileHtmlLinks(html: string): string {
  return html
    .replace(/href="RESERVATION_SYSTEM\.md"/g, 'href="/admin/guide/ko"')
    .replace(/href="RESERVATION_SYSTEM_EN\.html"/g, 'href="/admin/guide/mobile"')
    .replace(/href="RESERVATION_SYSTEM_EN\.md"/g, 'href="/admin/guide"');
}

export function loadAdminGuideHtml(): string {
  const operational = readFileSync(
    join(docsDir, "ADMIN_GUIDE_QUICKSTART_EN.md"),
    "utf8"
  );
  const technical = readFileSync(
    join(docsDir, "RESERVATION_SYSTEM_EN.md"),
    "utf8"
  );

  const combined = `${operational.trim()}\n\n---\n\n${technical.trim()}`;
  return markdownToHtml(rewriteDocLinksForWeb(combined));
}

export function loadKoreanGuideHtml(): string {
  const md = readFileSync(join(docsDir, "RESERVATION_SYSTEM.md"), "utf8");
  return markdownToHtml(rewriteDocLinksForWeb(md));
}

export function loadMobileGuideHtml(): string {
  const html = readFileSync(
    join(docsDir, "RESERVATION_SYSTEM_EN.html"),
    "utf8"
  );
  return rewriteMobileHtmlLinks(html);
}
