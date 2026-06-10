"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

interface GuideViewProps {
  html: string;
  hideHeader?: boolean;
}

export function GuideView({ html, hideHeader = false }: GuideViewProps) {
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      const mermaid = (await import("mermaid")).default;
      if (cancelled || !articleRef.current) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        flowchart: { useMaxWidth: true, htmlLabels: true },
        er: { useMaxWidth: true },
      });

      const nodes = articleRef.current.querySelectorAll<HTMLElement>(".mermaid");
      if (nodes.length > 0) {
        await mermaid.run({ nodes: Array.from(nodes) });
      }
    }

    renderMermaid().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {!hideHeader && (
        <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/admin"
              className="text-sm text-blue-600 underline"
            >
              ← Back to Dashboard
            </Link>
            <span className="text-sm font-semibold text-slate-700">How to use</span>
          </div>
          <nav className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a href="#admin-quick-reference" className="text-blue-600 underline">
              Admin
            </a>
            <a href="#player-quick-reference" className="text-blue-600 underline">
              Player
            </a>
            <a
              href="#svs-reservation-system-technical-reference"
              className="text-blue-600 underline"
            >
              Technical
            </a>
          </nav>
        </div>
      )}

      <article
        ref={articleRef}
        className="guide-prose text-slate-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
