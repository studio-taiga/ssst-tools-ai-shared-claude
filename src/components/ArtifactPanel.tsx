"use client";

import { Check, Code2, Copy, Download, Eye, Sparkles, X } from "lucide-react";
import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface ArtifactItem {
  id: string;
  title: string;
  type:
    | "text/html"
    | "image/svg+xml"
    | "application/vnd.ant.mermaid"
    | "text/markdown";
  content: string;
}

export function extractArtifacts(text: string): {
  cleanText: string;
  artifacts: ArtifactItem[];
} {
  const artifacts: ArtifactItem[] = [];
  let idx = 0;

  // 1. Explicit <antArtifact ...>...</antArtifact>
  let cleanText = text.replace(
    /<antArtifact\b([^>]*)>([\s\S]*?)<\/antArtifact>/g,
    (_match, attrs: string, body: string) => {
      const titleMatch = /title="([^"]+)"/.exec(attrs);
      const typeMatch = /type="([^"]+)"/.exec(attrs);
      const title = titleMatch?.[1] || `Artifact ${idx + 1}`;
      const rawType = typeMatch?.[1] || "text/html";
      const type: ArtifactItem["type"] =
        rawType === "image/svg+xml" ||
        rawType === "application/vnd.ant.mermaid" ||
        rawType === "text/markdown"
          ? rawType
          : "text/html";
      const id = `art-${idx++}`;
      artifacts.push({ id, title, type, content: body.trim() });
      return `\n\n[✨ Artifact: ${title}](#artifact-${id})\n\n`;
    }
  );

  // 2. Auto-detect substantial html / svg / mermaid code blocks if no explicit tag matched
  if (artifacts.length === 0) {
    cleanText = cleanText.replace(
      /```(html|svg|mermaid)\n([\s\S]*?)```/g,
      (full, lang: string, body: string) => {
        if (body.trim().split("\n").length < 4 && lang !== "mermaid") {
          return full;
        }
        const type: ArtifactItem["type"] =
          lang === "svg"
            ? "image/svg+xml"
            : lang === "mermaid"
            ? "application/vnd.ant.mermaid"
            : "text/html";
        const title =
          lang === "svg"
            ? "SVG グラフィック"
            : lang === "mermaid"
            ? "Mermaid ダイアグラム"
            : "HTML プレビュー";
        const id = `art-${idx++}`;
        artifacts.push({ id, title, type, content: body.trim() });
        return full;
      }
    );
  }

  return { cleanText, artifacts };
}

function buildPreviewSrcDoc(artifact: ArtifactItem): string {
  if (artifact.type === "text/html") {
    return artifact.content;
  }
  if (artifact.type === "image/svg+xml") {
    return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#ffffff;">${artifact.content}</body></html>`;
  }
  if (artifact.type === "application/vnd.ant.mermaid") {
    const escaped = artifact.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
  </script>
</head>
<body style="margin:16px;background:#ffffff;display:flex;justify-content:center;">
  <pre class="mermaid">${escaped}</pre>
</body>
</html>`;
  }
  return "";
}

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: ArtifactItem;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const ext =
      artifact.type === "text/html"
        ? "html"
        : artifact.type === "image/svg+xml"
        ? "svg"
        : artifact.type === "application/vnd.ant.mermaid"
        ? "mmd"
        : "md";
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "_")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="fixed md:static inset-0 z-40 md:w-[46%] lg:w-[48%] flex flex-col border-l border-[#2b2824] bg-[#161513] h-full">
      <div className="h-14 shrink-0 px-4 border-b border-[#2b2824] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[#d97757] shrink-0" />
          <span className="text-xs font-semibold text-[#faf9f5] truncate">
            {artifact.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-[#35322e] bg-[#1f1d1b] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] cursor-pointer ${
                viewMode === "preview"
                  ? "bg-[#d97757] text-white"
                  : "text-[#9e998e] hover:text-[#eceae4]"
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t("previewTab")}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("code")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] cursor-pointer ${
                viewMode === "code"
                  ? "bg-[#d97757] text-white"
                  : "text-[#9e998e] hover:text-[#eceae4]"
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>{t("codeTab")}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg border border-[#35322e] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
            title="コピー"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-lg border border-[#35322e] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
            title="ダウンロード"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#191817]">
        {viewMode === "code" ? (
          <pre className="p-4 text-xs font-mono text-[#e8e5de] whitespace-pre-wrap leading-relaxed">
            {artifact.content}
          </pre>
        ) : artifact.type === "text/markdown" ? (
          <div className="p-6">
            <MarkdownRenderer content={artifact.content} />
          </div>
        ) : (
          <iframe
            title={artifact.title}
            sandbox="allow-scripts"
            srcDoc={buildPreviewSrcDoc(artifact)}
            className="w-full h-full bg-white border-0"
          />
        )}
      </div>
    </aside>
  );
}
