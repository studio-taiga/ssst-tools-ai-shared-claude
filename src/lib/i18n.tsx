"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Lang = "ja" | "en";

const dict = {
  ja: {
    loading: "読み込み中...",
    appSubtitleLogin: "仮想アカウントでログイン",
    appSubtitleSetup: "初期セットアップ — システム管理者を作成",
    usernameLabel: "ユーザー名（半角英数字）",
    displayNameLabel: "表示名",
    teamNameLabel: "初期チーム名",
    passwordLabel: "パスワード",
    passwordPlaceholder: "6文字以上",
    firstConnectionTitle: "最初のClaude接続先（あとで追加・変更可能）",
    connTypeApi: "従量課金 (API)",
    connTypeCli: "プラン契約 (CLI)",
    connNameOptional: "接続名（任意）",
    apiKeyLabel: "API キー（環境変数 ANTHROPIC_API_KEY を使う場合は空欄）",
    oauthTokenLabel: "OAuth トークン（claude setup-token で発行）",
    advancedOptions: "詳細オプション（互換エンドポイント Base URL など）",
    baseUrlLabel: "Base URL（省略時は https://api.anthropic.com）",
    modelOverrideLabel: "互換サービス用カスタムモデル ID（任意）",
    cliDirLabel: "ローカル認証ディレクトリ (CLAUDE_CONFIG_DIR)",
    processing: "処理中...",
    createAdminAndStart: "システム管理者を作成して開始",
    loginBtn: "ログイン",
    authFailed: "認証に失敗しました。",
    networkError: "通信エラーが発生しました。",

    newChat: "新規",
    projects: "プロジェクト",
    allChats: "すべてのチャット",
    chatHistory: "チャット履歴",
    searchHistory: "履歴を検索...",
    noMatchingHistory: "一致する履歴がありません",
    noHistory: "履歴はまだありません",
    accountSettings: "アカウント設定",
    systemAdmin: "システム管理",
    teamAdmin: "チーム管理",
    logout: "ログアウト",

    defaultConnection: "接続先: 標準",
    noProject: "プロジェクトなし",
    exportMarkdown: "Markdown 形式でエクスポート",
    welcomePrefix: "こんにちは、",
    welcomeSuffix: " さん",
    welcomeDesc:
      "このワークスペースのチャット履歴・プロジェクト・ナレッジはあなたの仮想アカウント専用に完全に分離されています。",
    projectContextActive: "のコンテキストが有効です",
    noActiveConnectionsAdmin:
      "有効なClaude接続先がまだありません。左下の管理パネルから APIキー 等を登録してください。",
    noActiveConnectionsMember:
      "有効なClaude接続先がまだありません。管理者にClaude接続先の登録を依頼してください。",

    dropFilesTitle: "ファイルをドロップして添付",
    dropFilesSub: "論文 PDF・画像・実験データ (CSV / TXT / JSON など) に対応",
    generating: "Claude が応答を生成中...",
    thinkingProcess: "思考プロセス",
    thinkingNow: "思考中...",
    previewBtn: "プレビュー",
    regenerateBtn: "再生成",
    saveAndResend: "保存して再送信",
    cancel: "キャンセル",
    close: "閉じる",
    save: "保存",
    saving: "保存中...",
    savedMsg: "設定を保存しました。",

    composerPlaceholder: "Claude にメッセージを送信...",
    attach: "添付",
    attachPdfOk: "添付 (PDF可)",
    loadingPdf: "読込中...",
    thinkingToggle: "思考",
    webToggle: "Web",
    artifactToggle: "Artifact",
    send: "送信",
    stop: "停止",

    modelSelectTitle: "モデル選択",
    pricingUnitNote: "(単価: 入力 / 出力 per 1M tok)",
    planFixedNote: "(プラン契約定額枠)",
    searchModelsPlaceholder: "モデル名や ID で検索...",
    freeOnly: "無料のみ",
    freeBadge: "無料",
    noModelsFound: "一致するモデルが見つかりません",
    customModelPlaceholder: "カスタムモデル ID を直接入力...",
    applyBtn: "指定",

    previewTab: "プレビュー",
    codeTab: "コード",
    copy: "コピー",
    copied: "コピー済み",
    download: "ダウンロード",

    usageHistoryTab: "利用状況・過去履歴",
    monthlyTokensLabel: "今月の利用トークン数",
    unlimited: "上限なし",
    customInstructionsLabel:
      "このアカウントのカスタム指示（ペルソナ・共通コンテキスト）",
    defaultModelLabel: "デフォルトモデル",
    defaultConnLabel: "デフォルトClaude接続先",
    useSystemDefault: "システム標準を使用",
    changePasswordTitle: "パスワード変更（変更しない場合は空欄）",
    currentPasswordPlaceholder: "現在のパスワード",
    newPasswordPlaceholder: "新しいパスワード（6文字以上）",
  },
  en: {
    loading: "Loading...",
    appSubtitleLogin: "Sign in with a virtual account",
    appSubtitleSetup: "Initial Setup — Create System Admin",
    usernameLabel: "Username (alphanumeric, _ or -)",
    displayNameLabel: "Display Name",
    teamNameLabel: "Initial Team Name",
    passwordLabel: "Password",
    passwordPlaceholder: "At least 6 characters",
    firstConnectionTitle: "First Claude Connection (can be changed later)",
    connTypeApi: "Pay-as-you-go (API)",
    connTypeCli: "Subscription Plan (CLI)",
    connNameOptional: "Connection Name (optional)",
    apiKeyLabel: "API Key (leave blank to use ANTHROPIC_API_KEY env var)",
    oauthTokenLabel: "OAuth Token (generated via claude setup-token)",
    advancedOptions: "Advanced options (compatible Base URL, etc.)",
    baseUrlLabel: "Base URL (default: https://api.anthropic.com)",
    modelOverrideLabel: "Custom Model ID for compatible endpoint (optional)",
    cliDirLabel: "Local Auth Directory (CLAUDE_CONFIG_DIR)",
    processing: "Processing...",
    createAdminAndStart: "Create Admin & Start",
    loginBtn: "Sign In",
    authFailed: "Authentication failed.",
    networkError: "Network error occurred.",

    newChat: "New",
    projects: "Projects",
    allChats: "All Chats",
    chatHistory: "Chat History",
    searchHistory: "Search chats...",
    noMatchingHistory: "No matching chats",
    noHistory: "No chat history yet",
    accountSettings: "Account",
    systemAdmin: "System Admin",
    teamAdmin: "Team Admin",
    logout: "Sign Out",

    defaultConnection: "Connection: Default",
    noProject: "No Project",
    exportMarkdown: "Export as Markdown",
    welcomePrefix: "Hello, ",
    welcomeSuffix: "",
    welcomeDesc:
      "All chat history, projects, and knowledge files in this workspace are completely isolated to your virtual account.",
    projectContextActive: "project context is active",
    noActiveConnectionsAdmin:
      "No active Claude connection found. Please add an API key or plan connection in the Admin Panel.",
    noActiveConnectionsMember:
      "No active Claude connection found. Please ask your administrator to configure one.",

    dropFilesTitle: "Drop files to attach",
    dropFilesSub: "Supports research PDFs, images, and data files (CSV / TXT / JSON, etc.)",
    generating: "Claude is thinking...",
    thinkingProcess: "Thinking Process",
    thinkingNow: "Thinking...",
    previewBtn: "Preview",
    regenerateBtn: "Regenerate",
    saveAndResend: "Save & Resend",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    saving: "Saving...",
    savedMsg: "Settings saved.",

    composerPlaceholder: "Message Claude...",
    attach: "Attach",
    attachPdfOk: "Attach (PDF OK)",
    loadingPdf: "Reading...",
    thinkingToggle: "Thinking",
    webToggle: "Web",
    artifactToggle: "Artifact",
    send: "Send",
    stop: "Stop",

    modelSelectTitle: "Select Model",
    pricingUnitNote: "(Price: Input / Output per 1M tok)",
    planFixedNote: "(Fixed Plan Quota)",
    searchModelsPlaceholder: "Search by model name or ID...",
    freeOnly: "Free only",
    freeBadge: "Free",
    noModelsFound: "No matching models found",
    customModelPlaceholder: "Enter custom model ID...",
    applyBtn: "Apply",

    previewTab: "Preview",
    codeTab: "Code",
    copy: "Copy",
    copied: "Copied",
    download: "Download",

    usageHistoryTab: "Usage & History",
    monthlyTokensLabel: "Tokens used this month",
    unlimited: "Unlimited",
    customInstructionsLabel:
      "Custom Instructions (Persona / Global Context for this account)",
    defaultModelLabel: "Default Model",
    defaultConnLabel: "Default Claude Connection",
    useSystemDefault: "Use System Default",
    changePasswordTitle: "Change Password (leave blank to keep current)",
    currentPasswordPlaceholder: "Current password",
    newPasswordPlaceholder: "New password (6+ chars)",
  },
} as const;

export type DictKey = keyof typeof dict.ja;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "ja",
  setLang: () => {},
  t: (key) => dict.ja[key],
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ja");

  useEffect(() => {
    const saved = localStorage.getItem("shared_claude_lang");
    if (saved === "ja" || saved === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLangState(saved);
    } else if (typeof navigator !== "undefined" && !navigator.language.startsWith("ja")) {
      setLangState("en");
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("shared_claude_lang", next);
    }
  };

  const t = (key: DictKey): string => dict[lang][key];

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ja" ? "en" : "ja")}
      className="inline-flex items-center rounded-lg border border-[#35322e] bg-[#1e1c1a] hover:bg-[#2a2825] px-2 py-1 text-[11px] font-mono text-[#b7b3aa] hover:text-[#faf9f5] transition-colors cursor-pointer"
      title="Switch Language (JA / EN)"
    >
      {lang === "ja" ? "EN" : "日本語"}
    </button>
  );
}
