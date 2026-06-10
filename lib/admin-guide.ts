import { readFileSync } from "fs";
import { join } from "path";
import { markdownToHtml } from "./markdown-to-html";

const docsDir = join(process.cwd(), "docs");

export type GuideTab = "admin" | "player" | "technical";

export interface GuideSections {
  admin: string;
  player: string;
  technical: string;
}

/** Rewrite doc-relative links for in-app /admin/guide/* routes (GitHub-relative paths 404 on Vercel). */
export function rewriteDocLinksForWeb(markdown: string): string {
  return markdown
    .replace(/\]\(RESERVATION_SYSTEM\.md\)/g, "](/admin/guide/ko)")
    .replace(/\]\(RESERVATION_SYSTEM_EN\.html\)/g, "](/admin/guide/mobile)")
    .replace(/\]\(RESERVATION_SYSTEM_EN\.md\)/g, "](/admin/guide?tab=technical)")
    .replace(
      /\]\(\.\.\/README\.md[^)]*\)/g,
      "](https://github.com/SxxM131/wos1234#-%EC%9A%B4%EC%98%81-%EC%8B%9C%EB%82%98%EB%A6%AC%EC%98%A4-%EC%9A%94%EC%95%BD)"
    );
}

export function rewriteMobileHtmlLinks(html: string): string {
  return html
    .replace(/href="RESERVATION_SYSTEM\.md"/g, 'href="/admin/guide/ko"')
    .replace(/href="RESERVATION_SYSTEM_EN\.html"/g, 'href="/admin/guide/mobile"')
    .replace(/href="RESERVATION_SYSTEM_EN\.md"/g, 'href="/admin/guide?tab=technical"');
}

function splitOperationalGuide(markdown: string): { admin: string; player: string } {
  const marker = "# Player Quick Reference";
  const idx = markdown.indexOf(marker);
  if (idx === -1) {
    return { admin: markdown.trim(), player: "" };
  }
  return {
    admin: markdown.slice(0, idx).trim(),
    player: markdown.slice(idx).trim(),
  };
}

export function loadGuideSections(): GuideSections {
  const operational = readFileSync(
    join(docsDir, "ADMIN_GUIDE_QUICKSTART_EN.md"),
    "utf8"
  );
  const technical = readFileSync(
    join(docsDir, "RESERVATION_SYSTEM_EN.md"),
    "utf8"
  );

  const { admin, player } = splitOperationalGuide(operational);

  return {
    admin: markdownToHtml(rewriteDocLinksForWeb(admin)),
    player: markdownToHtml(rewriteDocLinksForWeb(player)),
    technical: markdownToHtml(rewriteDocLinksForWeb(technical)),
  };
}

export function isGuideTab(value: string | undefined): value is GuideTab {
  return value === "admin" || value === "player" || value === "technical";
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
