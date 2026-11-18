"use client";

import { Check, ChevronDown, Search, Sparkles, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { CLAUDE_MODELS } from "@/lib/models";

export interface RemoteModelOption {
  id: string;
  displayName: string;
  pricing?: {
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    isExact?: boolean;
  };
}

interface ModelPickerProps {
  selectedModel: string;
  remoteModels: RemoteModelOption[];
  defaultModelOverride?: string | null;
  showPricing: boolean;
  onSelect: (modelId: string) => void;
}

function formatUsd(val: number): string {
  if (val === 0) return "$0";
  if (val < 0.01) return `$${val.toFixed(4)}`;
  if (val < 1) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(2)}`;
}

function getFallbackPricing(modelId: string) {
  if (/:free$/i.test(modelId) || /^openrouter\/free$/i.test(modelId)) {
    return { inputPerMillionUsd: 0, outputPerMillionUsd: 0 };
  }
  if (/haiku/i.test(modelId)) {
    return { inputPerMillionUsd: 1.0, outputPerMillionUsd: 5.0 };
  }
  if (/opus|fable|mythos/i.test(modelId)) {
    return { inputPerMillionUsd: 15.0, outputPerMillionUsd: 75.0 };
  }
  return { inputPerMillionUsd: 3.0, outputPerMillionUsd: 15.0 };
}

export function ModelPicker({
  selectedModel,
  remoteModels,
  defaultModelOverride,
  showPricing,
  onSelect,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  const allOptions = useMemo(() => {
    const list: RemoteModelOption[] = [];
    const seen = new Set<string>();

    if (defaultModelOverride && !seen.has(defaultModelOverride)) {
      seen.add(defaultModelOverride);
      const foundRemote = remoteModels.find(
        (rm) => rm.id === defaultModelOverride
      );
      list.push(
        foundRemote ?? {
          id: defaultModelOverride,
          displayName: `${defaultModelOverride} (接続先推奨)`,
          pricing: getFallbackPricing(defaultModelOverride),
        }
      );
    }

    if (remoteModels.length > 0) {
      for (const rm of remoteModels) {
        if (seen.has(rm.id)) continue;
        seen.add(rm.id);
        list.push(rm);
      }
    } else {
      // 接続先からモデル一覧を取得できない場合（CLIモード等）のみ標準Claudeモデルを表示
      for (const m of CLAUDE_MODELS) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        list.push({
          id: m.id,
          displayName: m.label,
          pricing: getFallbackPricing(m.id),
        });
      }
    }

    return list;
  }, [remoteModels, defaultModelOverride]);

  const currentOption = useMemo(() => {
    return (
      allOptions.find((o) => o.id === selectedModel) ?? {
        id: selectedModel,
        displayName: selectedModel,
        pricing: getFallbackPricing(selectedModel),
      }
    );
  }, [allOptions, selectedModel]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allOptions.filter((opt) => {
      if (freeOnly) {
        const isFree =
          opt.pricing &&
          opt.pricing.inputPerMillionUsd === 0 &&
          opt.pricing.outputPerMillionUsd === 0;
        if (!isFree && !/:free$/i.test(opt.id)) return false;
      }
      if (!q) return true;
      return (
        opt.displayName.toLowerCase().includes(q) ||
        opt.id.toLowerCase().includes(q)
      );
    });
  }, [allOptions, query, freeOnly]);

  const renderPriceBadge = (pricing?: RemoteModelOption["pricing"]) => {
    if (!showPricing || !pricing) return null;
    if (pricing.inputPerMillionUsd === 0 && pricing.outputPerMillionUsd === 0) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-medium shrink-0">
          無料
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono text-[#9e998e] shrink-0">
        {formatUsd(pricing.inputPerMillionUsd)} /{" "}
        {formatUsd(pricing.outputPerMillionUsd)}
      </span>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCustomDraft(selectedModel);
          setOpen(true);
        }}
        className="inline-flex items-center justify-between gap-2 rounded-lg bg-[#22201e] border border-[#35322e] hover:border-[#d97757]/60 px-2.5 py-1.5 text-xs text-[#eceae4] min-w-0 max-w-full sm:max-w-[260px] flex-1 sm:flex-initial cursor-pointer"
        title="モデルを選択"
      >
        <span className="truncate font-medium">
          {currentOption.displayName}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {showPricing && renderPriceBadge(currentOption.pricing)}
          <ChevronDown className="w-3.5 h-3.5 text-[#858077]" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[82vh] flex flex-col rounded-2xl border border-[#35322e] bg-[#22201e] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#302d29] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#d97757]" />
                <span className="text-sm font-semibold text-[#faf9f5]">
                  モデル選択
                </span>
                {showPricing ? (
                  <span className="text-[10px] text-[#858077]">
                    (単価: 入力 / 出力 per 1M tok)
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-300">
                    (プラン契約定額枠)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-[#2b2824] bg-[#1e1c1a] flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-[#78736a] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="モデル名や ID で検索..."
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] pl-8 pr-3 py-1.5 text-base sm:text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>

              {showPricing && (
                <button
                  type="button"
                  onClick={() => setFreeOnly((v) => !v)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs border transition-colors cursor-pointer ${
                    freeOnly
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-[#191817] border-[#35322e] text-[#9e998e] hover:text-[#eceae4]"
                  }`}
                >
                  無料のみ
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#858077]">
                  一致するモデルが見つかりません
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.id === selectedModel;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelect(opt.id);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#d97757]/15 border border-[#d97757]/40"
                          : "hover:bg-[#2a2724] border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
                          )}
                          <span className="text-xs font-medium text-[#faf9f5] truncate">
                            {opt.displayName}
                          </span>
                        </div>
                        {opt.displayName !== opt.id && (
                          <div className="text-[10px] font-mono text-[#78736a] truncate">
                            {opt.id}
                          </div>
                        )}
                      </div>
                      {renderPriceBadge(opt.pricing)}
                    </button>
                  );
                })
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = customDraft.trim();
                if (trimmed) {
                  onSelect(trimmed);
                  setOpen(false);
                }
              }}
              className="p-3 border-t border-[#302d29] bg-[#1e1c1a] flex items-center gap-2"
            >
              <input
                type="text"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                placeholder="カスタムモデル ID を直接入力..."
                className="flex-1 rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1.5 text-base sm:text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white shrink-0 cursor-pointer"
              >
                指定
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
