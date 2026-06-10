import { readFileSync } from "fs";
import { join } from "path";
import { markdownToHtml } from "./markdown-to-html";

export function loadAdminGuideHtml(): string {
  const docsDir = join(process.cwd(), "docs");
  const quickstart = readFileSync(
    join(docsDir, "ADMIN_GUIDE_QUICKSTART_EN.md"),
    "utf8"
  );
  const full = readFileSync(join(docsDir, "RESERVATION_SYSTEM_EN.md"), "utf8");

  const combined = `${quickstart}\n\n---\n\n${full}`;
  return markdownToHtml(combined);
}
