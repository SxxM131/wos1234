"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GuideSections, GuideTab } from "@/lib/admin-guide";

const TABS: { id: GuideTab; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "player", label: "Player" },
  { id: "technical", label: "스택" },
];

interface GuideViewProps {
  sections?: GuideSections;
  initialTab?: GuideTab;
  html?: string;
  hideHeader?: boolean;
}

export function GuideView({
  sections,
  initialTab = "admin",
  html,
  hideHeader = false,
}: GuideViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const articleRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<GuideTab>(initialTab);

  const activeHtml = sections
    ? sections[activeTab]
    : html ?? "";

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = useCallback(
    (tab: GuideTab) => {
      setActiveTab(tab);
      if (sections && pathname) {
        router.replace(`${pathname}?tab=${tab}`, { scroll: false });
      }
    },
    [sections, pathname, router]
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      const mermaid = (await import("mermaid")).default;
      if (cancelled || !articleRef.current) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        flowchart: { useMaxWidth: true, htmlLabels: false },
        er: { useMaxWidth: true },
      });

      const nodes = articleRef.current.querySelectorAll<HTMLElement>(".mermaid");
      let index = 0;
      for (const node of Array.from(nodes)) {
        const code = node.textContent?.trim() ?? "";
        if (!code) continue;
        const id = `guide-mermaid-${sections ? activeTab : "single"}-${index++}`;
        try {
          const { svg } = await mermaid.render(id, code);
          if (!cancelled) {
            node.innerHTML = svg;
          }
        } catch (err) {
          console.error("Mermaid render failed:", err);
        }
      }
    }

    renderMermaid().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [activeHtml, activeTab, sections]);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {!hideHeader && sections && (
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="text-sm text-blue-600 underline">
              ← Back to Dashboard
            </Link>
            <span className="text-base font-semibold text-slate-800">
              How to use
            </span>
          </div>
          <nav
            className="mt-4 grid grid-cols-3 gap-2"
            role="tablist"
            aria-label="Guide sections"
          >
            {TABS.map(({ id, label }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(id)}
                  className={`min-h-[48px] rounded-xl px-2 py-3 text-base font-semibold transition-colors ${
                    selected
                      ? "bg-brand-600 text-white shadow-md"
                      : "border-2 border-slate-300 bg-white text-slate-700 active:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {!hideHeader && !sections && (
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <Link href="/admin/guide" className="text-sm text-blue-600 underline">
            ← English guide
          </Link>
        </div>
      )}

      <article
        key={sections ? activeTab : "single"}
        ref={articleRef}
        role={sections ? "tabpanel" : undefined}
        className="guide-prose text-slate-800"
        dangerouslySetInnerHTML={{ __html: activeHtml }}
      />
    </div>
  );
}
