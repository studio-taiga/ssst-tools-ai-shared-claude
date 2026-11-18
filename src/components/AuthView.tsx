"use client";

import { KeyRound, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import React, { useState } from "react";
import { PublicUser } from "@/types/app";

interface AuthViewProps {
  needsSetup: boolean;
  initialError?: string | null;
  onAuthenticated: (user: PublicUser) => void;
}

export function AuthView({
  needsSetup,
  initialError,
  onAuthenticated,
}: AuthViewProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("デフォルトチーム");
  const [password, setPassword] = useState("");
  const [connectionType, setConnectionType] = useState<
    "anthropic_api" | "claude_cli"
  >("anthropic_api");
  const [connectionName, setConnectionName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [cliConfigDir, setCliConfigDir] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = needsSetup ? "/api/auth/setup" : "/api/auth/login";
      const payload = needsSetup
        ? {
            username,
            displayName: displayName || username,
            teamName,
            password,
            connectionType,
            connectionName,
            apiKey,
            cliConfigDir,
          }
        : { username, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        user?: PublicUser;
        error?: string;
      };

      if (!res.ok || !data.user) {
        setError(data.error || "認証に失敗しました。");
        return;
      }

      onAuthenticated(data.user);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#191817]">
      <div className="w-full max-w-md rounded-2xl border border-[#302d29] bg-[#22201e] p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#d97757]/15 border border-[#d97757]/40 flex items-center justify-center text-[#d97757]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#faf9f5]">
              Shared Claude
            </h1>
            <p className="text-xs text-[#9e998e]">
              {needsSetup
                ? "初期セットアップ — システム管理者を作成"
                : "仮想アカウントでログイン"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              ユーザー名（半角英数字）
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
            />
          </div>

          {needsSetup && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                  表示名
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="システム管理者"
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                  初期チーム名
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="デフォルトチーム"
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              パスワード
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
              className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
            />
          </div>

          {needsSetup && (
            <div className="pt-2 border-t border-[#302d29] space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#d97757]">
                <ShieldCheck className="w-4 h-4" />
                <span>最初のClaude接続先（あとで追加・変更可能）</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConnectionType("anthropic_api")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    connectionType === "anthropic_api"
                      ? "bg-[#d97757]/15 border-[#d97757] text-[#faf9f5]"
                      : "bg-[#191817] border-[#35322e] text-[#9e998e] hover:text-[#eceae4]"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>従量課金 (API)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType("claude_cli")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    connectionType === "claude_cli"
                      ? "bg-[#d97757]/15 border-[#d97757] text-[#faf9f5]"
                      : "bg-[#191817] border-[#35322e] text-[#9e998e] hover:text-[#eceae4]"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>プラン契約 (CLI)</span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-[#9e998e] mb-1">
                  接続名（任意）
                </label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder={
                    connectionType === "anthropic_api"
                      ? "システム共通 Anthropic API"
                      : "Claude プラン契約 (CLI)"
                  }
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>

              {connectionType === "anthropic_api" ? (
                <div>
                  <label className="block text-xs text-[#9e998e] mb-1">
                    Anthropic API キー（環境変数を使う場合は空欄）
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-[#9e998e] mb-1">
                    CLAUDE_CONFIG_DIR（デフォルト ~/.claude の場合は空欄）
                  </label>
                  <input
                    type="text"
                    value={cliConfigDir}
                    onChange={(e) => setCliConfigDir(e.target.value)}
                    placeholder="例: /Users/taiga/.claude-max"
                    className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <p className="mt-1 text-[11px] text-[#858077]">
                    ※Firebase App Hosting 等のサーバーレス環境では「従量課金 (API)」を推奨します。
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#d97757] hover:bg-[#c86747] disabled:opacity-50 text-white font-medium py-2.5 text-sm transition-colors cursor-pointer"
          >
            {loading
              ? "処理中..."
              : needsSetup
              ? "システム管理者を作成して開始"
              : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
