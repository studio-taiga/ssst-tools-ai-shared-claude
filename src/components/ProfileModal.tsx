"use client";

import { UserCog, X } from "lucide-react";
import React, { useState } from "react";
import { CLAUDE_MODELS } from "@/lib/models";
import { PublicConnection, PublicUser } from "@/types/app";

interface ProfileModalProps {
  user: PublicUser;
  monthlyTokens: number;
  connections: PublicConnection[];
  onClose: () => void;
  onUpdated: (user: PublicUser) => void;
}

export function ProfileModal({
  user,
  monthlyTokens,
  connections,
  onClose,
  onUpdated,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [customInstructions, setCustomInstructions] = useState(
    user.customInstructions
  );
  const [defaultModel, setDefaultModel] = useState(user.defaultModel);
  const [defaultConnectionId, setDefaultConnectionId] = useState(
    user.defaultConnectionId ?? ""
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          customInstructions,
          defaultModel,
          defaultConnectionId: defaultConnectionId || null,
          currentPassword: newPassword ? currentPassword : undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = (await res.json()) as {
        user?: PublicUser;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || "更新に失敗しました。");
        return;
      }
      onUpdated(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("設定を保存しました。");
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-[#35322e] bg-[#22201e] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#302d29]">
          <div className="flex items-center gap-2.5">
            <UserCog className="w-5 h-5 text-[#d97757]" />
            <h2 className="text-base font-semibold text-[#faf9f5]">
              仮想アカウント設定 ({user.username})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          <div className="rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-[#9e998e]">今月の利用トークン数</span>
            <span className="font-mono font-medium text-[#eceae4]">
              {monthlyTokens.toLocaleString()}
              {user.monthlyTokenLimit !== null
                ? ` / ${user.monthlyTokenLimit.toLocaleString()}`
                : " (上限なし)"}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              表示名
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                デフォルトモデル
              </label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                デフォルトClaude接続先
              </label>
              <select
                value={defaultConnectionId}
                onChange={(e) => setDefaultConnectionId(e.target.value)}
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              >
                <option value="">システム標準を使用</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (
                    {c.type === "claude_cli" ? "プラン契約" : "従量課金"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              このアカウントのカスタム指示（ペルソナ・共通コンテキスト）
            </label>
            <textarea
              rows={4}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="例: 私はバックエンドエンジニアです。回答は常にTypeScriptの例を含めて簡潔にしてください。"
              className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
            />
          </div>

          <div className="pt-3 border-t border-[#302d29] space-y-3">
            <div className="text-xs font-medium text-[#b7b3aa]">
              パスワード変更（変更しない場合は空欄）
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="現在のパスワード"
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新しいパスワード（6文字以上）"
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#35322e] px-4 py-2 text-xs text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#d97757] hover:bg-[#c86747] disabled:opacity-50 px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
