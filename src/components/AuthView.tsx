"use client";

import { ChevronDown, ChevronRight, KeyRound, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import React, { useState } from "react";
import { LanguageSwitch, useI18n } from "@/lib/i18n";
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
  const { lang, t } = useI18n();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState(
    lang === "ja" ? "デフォルトチーム" : "Default Team"
  );
  const [password, setPassword] = useState("");
  const [connectionType, setConnectionType] = useState<
    "anthropic_api" | "claude_cli"
  >("anthropic_api");
  const [connectionName, setConnectionName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModelOverride, setDefaultModelOverride] = useState("");
  const [cliConfigDir, setCliConfigDir] = useState("");
  const [showAdvancedConn, setShowAdvancedConn] = useState(false);
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
            oauthToken,
            baseUrl,
            defaultModelOverride,
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
        setError(data.error || t("authFailed"));
        return;
      }

      onAuthenticated(data.user);
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#191817]">
      <div className="w-full max-w-md rounded-2xl border border-[#302d29] bg-[#22201e] p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d97757]/15 border border-[#d97757]/40 flex items-center justify-center text-[#d97757]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#faf9f5]">
                Shared Claude
              </h1>
              <p className="text-xs text-[#9e998e]">
                {needsSetup ? t("appSubtitleSetup") : t("appSubtitleLogin")}
              </p>
            </div>
          </div>
          <LanguageSwitch />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              {t("usernameLabel")}
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
                  {t("displayNameLabel")}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Admin"
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                  {t("teamNameLabel")}
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Default Team"
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
              {t("passwordLabel")}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
            />
          </div>

          {needsSetup && (
            <div className="pt-2 border-t border-[#302d29] space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#d97757]">
                <ShieldCheck className="w-4 h-4" />
                <span>{t("firstConnectionTitle")}</span>
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
                  <span>{t("connTypeApi")}</span>
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
                  <span>{t("connTypeCli")}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs text-[#9e998e] mb-1">
                  {t("connNameOptional")}
                </label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder={
                    connectionType === "anthropic_api"
                      ? "Anthropic API"
                      : "Claude Subscription (CLI)"
                  }
                  className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                />
              </div>

              {connectionType === "anthropic_api" ? (
                <div>
                  <label className="block text-xs text-[#9e998e] mb-1">
                    {t("apiKeyLabel")}
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
                    {t("oauthTokenLabel")}
                  </label>
                  <input
                    type="password"
                    value={oauthToken}
                    onChange={(e) => setOauthToken(e.target.value)}
                    placeholder="sk-ant-oat01-..."
                    className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedConn((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
                >
                  {showAdvancedConn ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>{t("advancedOptions")}</span>
                </button>

                {showAdvancedConn && (
                  <div className="mt-2 space-y-2 rounded-lg border border-[#302d29] bg-[#191817] p-2.5">
                    <div>
                      <label className="block text-[11px] text-[#9e998e] mb-1">
                        {t("baseUrlLabel")}
                      </label>
                      <input
                        type="url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.anthropic.com"
                        className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9e998e] mb-1">
                        {t("modelOverrideLabel")}
                      </label>
                      <input
                        type="text"
                        value={defaultModelOverride}
                        onChange={(e) => setDefaultModelOverride(e.target.value)}
                        placeholder="e.g. anthropic/claude-sonnet-4.5"
                        className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                      />
                    </div>
                    {connectionType === "claude_cli" && (
                      <div>
                        <label className="block text-[11px] text-[#9e998e] mb-1">
                          {t("cliDirLabel")}
                        </label>
                        <input
                          type="text"
                          value={cliConfigDir}
                          onChange={(e) => setCliConfigDir(e.target.value)}
                          placeholder=""
                          className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
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
              ? t("processing")
              : needsSetup
              ? t("createAdminAndStart")
              : t("loginBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
