"use client";

import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Square,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CLAUDE_MODELS, RESPONSE_STYLES } from "@/lib/models";
import {
  ConversationItem,
  MessageAttachment,
  MessageItem,
  ProjectItem,
  PublicConnection,
  PublicUser,
} from "@/types/app";
import { AdminModal } from "./AdminModal";
import {
  ArtifactItem,
  ArtifactPanel,
  extractArtifacts,
} from "./ArtifactPanel";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ProfileModal } from "./ProfileModal";
import { ProjectModal } from "./ProjectModal";

interface WorkspaceAppProps {
  initialUser: PublicUser;
  initialMonthlyTokens: number;
  onLoggedOut: () => void;
}

export function WorkspaceApp({
  initialUser,
  initialMonthlyTokens,
  onLoggedOut,
}: WorkspaceAppProps) {
  const [user, setUser] = useState<PublicUser>(initialUser);
  const [monthlyTokens, setMonthlyTokens] = useState(initialMonthlyTokens);
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  // Composer & active settings
  const [selectedModel, setSelectedModel] = useState(initialUser.defaultModel);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    initialUser.defaultConnectionId ?? ""
  );
  const [remoteModels, setRemoteModels] = useState<
    Array<{ id: string; displayName: string }>
  >([]);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);

  // Claude feature toggles
  const [enableThinking, setEnableThinking] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableArtifacts, setEnableArtifacts] = useState(true);
  const [responseStyle, setResponseStyle] = useState("normal");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactItem | null>(
    null
  );
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<
    Record<string, boolean>
  >({});

  // Search, rename & message editing
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgDraft, setEditMsgDraft] = useState("");

  // Modals & UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<
    ProjectItem | "new" | null
  >(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/connections");
    if (res.ok) {
      const data = (await res.json()) as { connections: PublicConnection[] };
      setConnections(data.connections);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = (await res.json()) as { projects: ProjectItem[] };
      setProjects(data.projects);
    }
  }, []);

  const loadConversations = useCallback(async (projectId: string | null) => {
    const url = projectId
      ? `/api/conversations?projectId=${encodeURIComponent(projectId)}`
      : "/api/conversations";
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(data.conversations);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/connections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { connections: PublicConnection[] } | null) => {
        if (active && data) setConnections(data.connections);
      })
      .catch(() => {});
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { projects: ProjectItem[] } | null) => {
        if (active && data) setProjects(data.projects);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const url = selectedProjectId
      ? `/api/conversations?projectId=${encodeURIComponent(selectedProjectId)}`
      : "/api/conversations";
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { conversations: ConversationItem[] } | null) => {
        if (active && data) setConversations(data.conversations);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  const effectiveConn =
    connections.find((c) => c.id === selectedConnectionId) ??
    connections.find((c) => c.id === user.defaultConnectionId) ??
    connections.find((c) => c.isDefault) ??
    connections[0] ??
    null;

  useEffect(() => {
    if (!effectiveConn || effectiveConn.type !== "anthropic_api") {
      return;
    }
    let active = true;
    fetch(`/api/connections/${effectiveConn.id}/models`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: { models?: Array<{ id: string; displayName: string }> } | null) => {
          if (active && data?.models) {
            setRemoteModels(data.models);
          }
        }
      )
      .catch(() => {
        if (active) setRemoteModels([]);
      });
    return () => {
      active = false;
    };
  }, [effectiveConn]);

  const availableRemoteModels =
    effectiveConn?.type === "anthropic_api" ? remoteModels : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const openConversation = async (convId: string) => {
    setChatError(null);
    setActiveConvId(convId);
    setSidebarOpen(false);
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = (await res.json()) as {
        conversation: ConversationItem;
        messages: MessageItem[];
      };
      setMessages(data.messages);
      setSelectedModel(data.conversation.model);
      setSelectedConnectionId(data.conversation.connection_id ?? "");
      setDraftProjectId(data.conversation.project_id);
    }
  };

  const startNewChat = () => {
    setChatError(null);
    setActiveConvId(null);
    setMessages([]);
    setStreamingText("");
    setSelectedModel(user.defaultModel);
    setSelectedConnectionId(user.defaultConnectionId ?? "");
    setDraftProjectId(selectedProjectId);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    convId: string
  ) => {
    e.stopPropagation();
    const res = await fetch(`/api/conversations/${convId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        startNewChat();
      }
    }
  };

  const handleUpdateConversationMeta = async (patch: {
    model?: string;
    connectionId?: string | null;
    projectId?: string | null;
  }) => {
    let effectiveModel = patch.model;
    if (patch.model !== undefined) setSelectedModel(patch.model);
    if (patch.connectionId !== undefined) {
      setSelectedConnectionId(patch.connectionId ?? "");
      const targetConn = connections.find((c) => c.id === patch.connectionId);
      if (targetConn?.defaultModelOverride && patch.model === undefined) {
        effectiveModel = targetConn.defaultModelOverride;
        setSelectedModel(effectiveModel);
      }
    }
    if (patch.projectId !== undefined) setDraftProjectId(patch.projectId);

    if (!activeConvId) return;
    const res = await fetch(`/api/conversations/${activeConvId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...patch,
        ...(effectiveModel !== undefined ? { model: effectiveModel } : {}),
      }),
    });
    if (res.ok) {
      void loadConversations(selectedProjectId);
    }
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setChatError(null);
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result ?? "");
            resolve(res.split(",")[1] ?? "");
          };
          reader.readAsDataURL(file);
        });
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: file.type,
            kind: "image",
            data: base64,
          },
        ]);
      } else if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        if (file.size > 680 * 1024) {
          setChatError(
            `${file.name}: PDFファイルは Firestore 保存制限のため 680KB 以内にしてください（テキスト抽出済みの .txt / .md であれば 850KB まで添付可能です）。`
          );
          continue;
        }
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = String(reader.result ?? "");
            resolve(res.split(",")[1] ?? "");
          };
          reader.readAsDataURL(file);
        });
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: "application/pdf",
            kind: "pdf",
            data: base64,
          },
        ]);
      } else {
        const text = await file.text();
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: file.type || "text/plain",
            kind: "text",
            data: text.slice(0, 850_000),
          },
        ]);
      }
    }
    e.target.value = "";
  };

  const sendStreamRequest = async (opts: {
    targetConvId: string;
    content: string;
    attachments: MessageAttachment[];
    truncateFromMessageId?: string;
    regenerateOnly?: boolean;
  }) => {
    setIsStreaming(true);
    setStreamingText("");
    setStreamingThinking("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/conversations/${opts.targetConvId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: opts.content,
            attachments: opts.attachments,
            model: selectedModel,
            connectionId: selectedConnectionId || null,
            enableThinking,
            enableWebSearch,
            enableArtifacts,
            responseStyle,
            truncateFromMessageId: opts.truncateFromMessageId,
            regenerateOnly: opts.regenerateOnly,
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok || !res.body) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setChatError(errData.error || "メッセージ送信に失敗しました。");
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const acc = {
        text: "",
        thinking: "",
        connType: "",
        userMsgId: "",
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventName = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }
          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr) as {
              text?: string;
              error?: string;
              connectionType?: string;
              userMessageId?: string;
              assistantMessageId?: string;
              inputTokens?: number;
              outputTokens?: number;
            };

            if (eventName === "meta") {
              if (payload.connectionType) acc.connType = payload.connectionType;
              if (payload.userMessageId) acc.userMsgId = payload.userMessageId;
            } else if (eventName === "thinking" && payload.text) {
              acc.thinking += payload.text;
              setStreamingThinking(acc.thinking);
            } else if (eventName === "delta" && payload.text) {
              acc.text += payload.text;
              setStreamingText(acc.text);
            } else if (eventName === "error") {
              setChatError(
                payload.error || "応答生成中にエラーが発生しました。"
              );
            } else if (eventName === "done") {
              const inTok = payload.inputTokens ?? 0;
              const outTok = payload.outputTokens ?? 0;
              setMonthlyTokens((prev) => prev + inTok + outTok);
              const astId =
                payload.assistantMessageId || `ast-${crypto.randomUUID()}`;
              const finalUserMsgId = acc.userMsgId;
              const finalText = acc.text;
              const finalThinking = acc.thinking;
              const finalConnType = acc.connType;
              setMessages((prev) => {
                const updated = finalUserMsgId
                  ? prev.map((m) =>
                      m.id.startsWith("temp-")
                        ? { ...m, id: finalUserMsgId }
                        : m
                    )
                  : prev;
                return [
                  ...updated,
                  {
                    id: astId,
                    conversation_id: opts.targetConvId,
                    role: "assistant",
                    content: finalText,
                    thinking_content: finalThinking || null,
                    attachments_json: null,
                    input_tokens: inTok,
                    output_tokens: outTok,
                    model: selectedModel,
                    connection_type: finalConnType || null,
                    created_at: new Date().toISOString(),
                  },
                ];
              });

              if (enableArtifacts && finalText) {
                const { artifacts } = extractArtifacts(finalText);
                if (artifacts.length > 0) {
                  setActiveArtifact(artifacts[artifacts.length - 1]);
                }
              }

              setStreamingText("");
              setStreamingThinking("");
            }
          } catch {
            // ignore malformed JSON chunk
          }
        }
      }

      void loadConversations(selectedProjectId);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setChatError("ストリーミング中に通信エラーが発生しました。");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSend = async () => {
    if (isStreaming) return;
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;

    setChatError(null);
    const currentAttachments = [...attachments];
    setInput("");
    setAttachments([]);

    let targetConvId = activeConvId;
    if (!targetConvId) {
      const createRes = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: draftProjectId,
          model: selectedModel,
          connectionId: selectedConnectionId || null,
        }),
      });
      if (!createRes.ok) {
        const errData = (await createRes.json()) as { error?: string };
        setChatError(errData.error || "会話の作成に失敗しました。");
        return;
      }
      const createdData = (await createRes.json()) as {
        conversation: ConversationItem;
      };
      targetConvId = createdData.conversation.id;
      setActiveConvId(targetConvId);
      setConversations((prev) => [createdData.conversation, ...prev]);
    }

    const optimisticUserMsg: MessageItem = {
      id: `temp-${crypto.randomUUID()}`,
      conversation_id: targetConvId,
      role: "user",
      content: trimmed,
      attachments_json:
        currentAttachments.length > 0
          ? JSON.stringify(currentAttachments)
          : null,
      input_tokens: 0,
      output_tokens: 0,
      model: null,
      connection_type: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    await sendStreamRequest({
      targetConvId,
      content: trimmed,
      attachments: currentAttachments,
    });
  };

  const handleEditAndResend = async (msg: MessageItem) => {
    if (isStreaming || !activeConvId) return;
    const trimmed = editMsgDraft.trim();
    if (!trimmed) return;
    setEditingMsgId(null);
    setChatError(null);

    let existingAtts: MessageAttachment[] = [];
    if (msg.attachments_json) {
      try {
        existingAtts = JSON.parse(msg.attachments_json) as MessageAttachment[];
      } catch {
        existingAtts = [];
      }
    }

    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx === -1) return;

    const updatedUserMsg: MessageItem = {
      ...msg,
      id: `temp-${crypto.randomUUID()}`,
      content: trimmed,
    };
    setMessages((prev) => [...prev.slice(0, idx), updatedUserMsg]);

    await sendStreamRequest({
      targetConvId: activeConvId,
      content: trimmed,
      attachments: existingAtts,
      truncateFromMessageId: msg.id,
      regenerateOnly: false,
    });
  };

  const handleRegenerate = async (assistantMsg: MessageItem) => {
    if (isStreaming || !activeConvId) return;
    const idx = messages.findIndex((m) => m.id === assistantMsg.id);
    if (idx === -1) return;

    setChatError(null);
    setMessages((prev) => prev.slice(0, idx));

    await sendStreamRequest({
      targetConvId: activeConvId,
      content: "",
      attachments: [],
      truncateFromMessageId: assistantMsg.id,
      regenerateOnly: true,
    });
  };

  const handleRenameConversation = async (convId: string) => {
    const trimmed = renameDraft.trim();
    setRenamingConvId(null);
    if (!trimmed) return;
    const res = await fetch(`/api/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: trimmed } : c))
      );
    }
  };

  const handleTogglePin = async (
    e: React.MouseEvent,
    conv: ConversationItem
  ) => {
    e.stopPropagation();
    const nextPinned = !conv.is_pinned;
    const res = await fetch(`/api/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: nextPinned }),
    });
    if (res.ok) {
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === conv.id ? { ...c, is_pinned: nextPinned } : c
          )
          .sort((a, b) => {
            if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) {
              return a.is_pinned ? -1 : 1;
            }
            return b.updated_at.localeCompare(a.updated_at);
          })
      );
    }
  };

  const handleExportMarkdown = () => {
    if (messages.length === 0) return;
    const activeConv = conversations.find((c) => c.id === activeConvId);
    const title = activeConv?.title || "Shared Claude Chat";
    const lines = [`# ${title}\n`];
    for (const m of messages) {
      lines.push(
        `\n## ${m.role === "user" ? user.displayName : "Claude"}\n\n${m.content}\n`
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onLoggedOut();
  };

  const activeProject = projects.find((p) => p.id === draftProjectId) ?? null;

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh w-full overflow-hidden bg-[#191817] text-[#eceae4]">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 flex flex-col border-r border-[#2b2824] bg-[#141312] transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-3.5 border-b border-[#252320] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#d97757]/15 border border-[#d97757]/40 flex items-center justify-center text-[#d97757]">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm text-[#faf9f5]">
              Shared Claude
            </span>
          </div>
          <button
            type="button"
            onClick={startNewChat}
            className="inline-flex items-center gap-1 rounded-lg bg-[#d97757] hover:bg-[#c86747] px-2.5 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
          {/* Projects */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#858077]">
                プロジェクト
              </span>
              <button
                type="button"
                onClick={() => setEditingProject("new")}
                className="p-1 text-[#858077] hover:text-[#eceae4] cursor-pointer"
                title="新規プロジェクト"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  selectedProjectId === null
                    ? "bg-[#262421] text-[#faf9f5]"
                    : "text-[#9e998e] hover:bg-[#1e1c1a] hover:text-[#eceae4]"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span>すべてのチャット</span>
                </span>
              </button>

              {projects.map((p) => {
                const isSelected = selectedProjectId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? "bg-[#262421] text-[#faf9f5]"
                        : "text-[#9e998e] hover:bg-[#1e1c1a] hover:text-[#eceae4]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        if (!activeConvId) setDraftProjectId(p.id);
                      }}
                      className="flex-1 flex items-center gap-2 truncate text-left cursor-pointer"
                    >
                      {isSelected ? (
                        <FolderOpen className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProject(p)}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 text-[#858077] hover:text-[#eceae4] cursor-pointer"
                      title="プロジェクト設定・ナレッジ"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversations */}
          <div>
            <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#858077]">
              チャット履歴
            </div>
            <div className="px-1.5 mb-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#78736a] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="履歴を検索..."
                  className="w-full rounded-lg bg-[#1e1c1a] border border-[#2b2824] pl-8 pr-2.5 py-1 text-xs text-[#eceae4] placeholder-[#6f6b63] focus:outline-none focus:border-[#d97757]"
                />
              </div>
            </div>
            {(() => {
              const q = searchQuery.trim().toLowerCase();
              const filtered = q
                ? conversations.filter((c) =>
                    c.title.toLowerCase().includes(q)
                  )
                : conversations;
              if (filtered.length === 0) {
                return (
                  <div className="px-2.5 py-3 text-xs text-[#6f6b63]">
                    {q ? "一致する履歴がありません" : "履歴はまだありません"}
                  </div>
                );
              }
              return (
                <div className="space-y-0.5">
                  {filtered.map((c) => {
                    const isActive = activeConvId === c.id;
                    const isRenaming = renamingConvId === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (!isRenaming) {
                            setActiveArtifact(null);
                            void openConversation(c.id);
                          }
                        }}
                        className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[#2a2724] text-[#faf9f5]"
                            : "text-[#b7b3aa] hover:bg-[#1e1c1a] hover:text-[#eceae4]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {c.is_pinned ? (
                            <Pin className="w-3.5 h-3.5 shrink-0 text-[#d97757]" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[#858077]" />
                          )}
                          {isRenaming ? (
                            <input
                              type="text"
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void handleRenameConversation(c.id);
                                } else if (e.key === "Escape") {
                                  setRenamingConvId(null);
                                }
                              }}
                              onBlur={() => void handleRenameConversation(c.id)}
                              className="w-full rounded bg-[#191817] border border-[#d97757] px-1.5 py-0.5 text-xs text-[#faf9f5] focus:outline-none"
                            />
                          ) : (
                            <div className="min-w-0">
                              <div className="truncate">{c.title}</div>
                              {c.project_name && (
                                <div className="text-[10px] text-[#d97757] truncate">
                                  {c.project_name}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {!isRenaming && (
                          <div className="flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => void handleTogglePin(e, c)}
                              className={`p-1 cursor-pointer ${
                                c.is_pinned
                                  ? "text-[#d97757] hover:text-[#f3c6b6]"
                                  : "text-[#858077] hover:text-[#eceae4]"
                              }`}
                              title={c.is_pinned ? "ピン留めを解除" : "ピン留め"}
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingConvId(c.id);
                                setRenameDraft(c.title);
                              }}
                              className="p-1 text-[#858077] hover:text-[#eceae4] cursor-pointer"
                              title="名前を変更"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteConversation(e, c.id)}
                              className="p-1 text-[#858077] hover:text-red-400 cursor-pointer"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Account footer */}
        <div className="p-3 border-t border-[#252320] bg-[#171614] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#2a2825] border border-[#3a3732] flex items-center justify-center text-[#d97757] shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#faf9f5] truncate">
                  {user.displayName}
                </div>
                <div className="text-[10px] text-[#858077] truncate">
                  @{user.username}
                  {user.teamName ? ` ・ ${user.teamName}` : ""} ・{" "}
                  {monthlyTokens.toLocaleString()} tok
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 text-[#858077] hover:text-[#eceae4] cursor-pointer"
              title="ログアウト"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-[#2f2c28] bg-[#1e1c1a] hover:bg-[#262421] py-1.5 text-[11px] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>アカウント設定</span>
            </button>
            {(user.role === "system_admin" || user.role === "team_admin") && (
              <button
                type="button"
                onClick={() => setShowAdmin(true)}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-[#d97757]/30 bg-[#d97757]/10 hover:bg-[#d97757]/20 py-1.5 text-[11px] text-[#f3c6b6] cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>
                  {user.role === "system_admin" ? "システム管理" : "チーム管理"}
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <header className="shrink-0 border-b border-[#2b2824] bg-[#191817] px-3 sm:px-4 py-2 sm:py-0 sm:h-14 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 text-[#b7b3aa] hover:text-[#eceae4] shrink-0 cursor-pointer"
              aria-label="メニューを開く"
            >
              <Menu className="w-5 h-5" />
            </button>

            {customModelMode ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = customModelDraft.trim();
                  if (val) {
                    void handleUpdateConversationMeta({ model: val });
                  }
                  setCustomModelMode(false);
                }}
                className="flex items-center gap-1 flex-1 min-w-0"
              >
                <input
                  type="text"
                  autoFocus
                  value={customModelDraft}
                  onChange={(e) => setCustomModelDraft(e.target.value)}
                  placeholder="モデルID (例: openrouter/free)"
                  className="rounded-lg bg-[#22201e] border border-[#d97757] px-2.5 py-1 text-base sm:text-xs text-[#eceae4] focus:outline-none flex-1 min-w-0 sm:w-52"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#d97757] px-2.5 py-1.5 sm:py-1 text-xs text-white shrink-0 cursor-pointer"
                >
                  決定
                </button>
                <button
                  type="button"
                  onClick={() => setCustomModelMode(false)}
                  className="rounded-lg border border-[#35322e] px-2 py-1.5 sm:py-1 text-xs text-[#9e998e] shrink-0 cursor-pointer"
                >
                  戻る
                </button>
              </form>
            ) : (
              <select
                value={selectedModel}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomModelDraft(selectedModel);
                    setCustomModelMode(true);
                    return;
                  }
                  void handleUpdateConversationMeta({ model: e.target.value });
                }}
                className="rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757] flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[220px] truncate"
                title="モデル選択"
              >
                {(() => {
                  const customIds = [
                    effectiveConn?.defaultModelOverride,
                    selectedModel,
                  ].filter(
                    (id): id is string =>
                      Boolean(id) &&
                      !CLAUDE_MODELS.some((m) => m.id === id) &&
                      !availableRemoteModels.some((rm) => rm.id === id)
                  );
                  const uniqueCustomIds = Array.from(new Set(customIds));
                  return (
                    <>
                      {uniqueCustomIds.map((id) => (
                        <option key={id} value={id}>
                          {id} (カスタム)
                        </option>
                      ))}
                      {(() => {
                        const freeModels = availableRemoteModels.filter((rm) =>
                          rm.id.endsWith(":free")
                        );
                        return (
                          <>
                            {freeModels.length > 0 && (
                              <optgroup
                                label={`無料モデル :free (${freeModels.length}件)`}
                              >
                                {freeModels.map((rm) => (
                                  <option key={`free-${rm.id}`} value={rm.id}>
                                    {rm.displayName}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {availableRemoteModels.length > 0 && (
                              <optgroup
                                label={`接続先の利用可能モデル (${availableRemoteModels.length}件・名前順)`}
                              >
                                {availableRemoteModels.map((rm) => (
                                  <option key={rm.id} value={rm.id}>
                                    {rm.displayName}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                      <optgroup label="Claude 標準モデル">
                        {CLAUDE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </optgroup>
                      <option value="__custom__">
                        ✏️ カスタムモデル ID を入力...
                      </option>
                    </>
                  );
                })()}
              </select>
            )}

            <select
              value={selectedConnectionId}
              onChange={(e) =>
                handleUpdateConversationMeta({
                  connectionId: e.target.value || null,
                })
              }
              className="hidden sm:block rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757] max-w-[190px]"
              title="Claude接続先（API / プラン契約）"
            >
              <option value="">接続先: 標準</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === "claude_cli" ? "📋 " : "🔑 "}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <select
              value={selectedConnectionId}
              onChange={(e) =>
                handleUpdateConversationMeta({
                  connectionId: e.target.value || null,
                })
              }
              className="sm:hidden rounded-lg bg-[#22201e] border border-[#35322e] px-2 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757] flex-1 min-w-0 truncate"
              title="Claude接続先（API / プラン契約）"
            >
              <option value="">接続先: 標準</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === "claude_cli" ? "📋 " : "🔑 "}
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={draftProjectId ?? ""}
              onChange={(e) =>
                handleUpdateConversationMeta({
                  projectId: e.target.value || null,
                })
              }
              className="rounded-lg bg-[#22201e] border border-[#35322e] px-2 sm:px-2.5 py-1.5 text-xs text-[#b7b3aa] focus:outline-none focus:border-[#d97757] flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[160px] truncate"
              title="紐づくプロジェクト"
            >
              <option value="">プロジェクトなし</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="p-1.5 rounded-lg border border-[#35322e] bg-[#22201e] text-[#b7b3aa] hover:text-[#eceae4] shrink-0 cursor-pointer"
                title="Markdown 形式でエクスポート"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !isStreaming ? (
              <div className="py-16 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#d97757]/15 border border-[#d97757]/40 flex items-center justify-center text-[#d97757] mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-semibold text-[#faf9f5]">
                  こんにちは、{user.displayName} さん
                </h2>
                <p className="text-xs text-[#9e998e] max-w-md mx-auto leading-relaxed">
                  このワークスペースのチャット履歴・プロジェクト・ナレッジはあなたの仮想アカウント（@{user.username}）専用に完全に分離されています。
                </p>
                {activeProject && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-[#d97757]/30 bg-[#d97757]/10 px-3.5 py-2 text-xs text-[#f3c6b6]">
                    <FolderOpen className="w-4 h-4" />
                    <span>
                      プロジェクト「{activeProject.name}」のコンテキストが有効です
                    </span>
                  </div>
                )}
                {connections.length === 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 max-w-md mx-auto">
                    有効なClaude接続先がまだありません。
                    {user.role === "system_admin" || user.role === "team_admin"
                      ? "左下の管理パネルから APIキー 等を登録してください。"
                      : "管理者にClaude接続先の登録を依頼してください。"}
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((m) => {
                  let parsedAtts: MessageAttachment[] = [];
                  if (m.attachments_json) {
                    try {
                      parsedAtts = JSON.parse(
                        m.attachments_json
                      ) as MessageAttachment[];
                    } catch {
                      parsedAtts = [];
                    }
                  }

                  if (m.role === "user") {
                    const isEditingThis = editingMsgId === m.id;
                    return (
                      <div key={m.id} className="group flex justify-end items-start gap-2">
                        {!isEditingThis && !isStreaming && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsgId(m.id);
                              setEditMsgDraft(m.content);
                            }}
                            className="opacity-70 md:opacity-0 md:group-hover:opacity-100 mt-2 p-1.5 text-[#78736a] hover:text-[#eceae4] cursor-pointer"
                            title="メッセージを編集して再送信"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="max-w-[85%] rounded-2xl bg-[#2a2724] border border-[#38342f] px-4 py-3 text-sm text-[#faf9f5] space-y-2">
                          {parsedAtts.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {parsedAtts.map((att, idx) =>
                                att.kind === "image" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={idx}
                                    src={`data:${att.mimeType};base64,${att.data}`}
                                    alt={att.name}
                                    className="max-h-40 rounded-lg border border-[#3e3a34]"
                                  />
                                ) : (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 rounded bg-[#191817] px-2 py-1 text-xs text-[#b7b3aa]"
                                  >
                                    {att.kind === "pdf" ? (
                                      <FileText className="w-3.5 h-3.5 text-[#d97757]" />
                                    ) : (
                                      "📎"
                                    )}{" "}
                                    {att.name}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                          {isEditingThis ? (
                            <div className="space-y-2 min-w-[260px]">
                              <textarea
                                rows={3}
                                value={editMsgDraft}
                                onChange={(e) => setEditMsgDraft(e.target.value)}
                                className="w-full rounded-lg bg-[#191817] border border-[#d97757] p-2 text-sm text-[#faf9f5] focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingMsgId(null)}
                                  className="px-2.5 py-1 text-xs text-[#b7b3aa] cursor-pointer"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleEditAndResend(m)}
                                  className="rounded-lg bg-[#d97757] px-3 py-1 text-xs font-medium text-white cursor-pointer"
                                >
                                  保存して再送信
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {m.content}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const { cleanText, artifacts } = extractArtifacts(m.content);
                  const isThinkingOpen = Boolean(expandedThinkingIds[m.id]);

                  return (
                    <div key={m.id} className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-lg bg-[#d97757]/15 border border-[#d97757]/30 flex items-center justify-center text-[#d97757] shrink-0 mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        {m.thinking_content && (
                          <div className="rounded-xl border border-[#302d29] bg-[#1e1c1a] overflow-hidden">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedThinkingIds((prev) => ({
                                  ...prev,
                                  [m.id]: !prev[m.id],
                                }))
                              }
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
                            >
                              <Brain className="w-3.5 h-3.5 text-[#d97757]" />
                              <span>思考プロセス</span>
                              {isThinkingOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                              )}
                            </button>
                            {isThinkingOpen && (
                              <div className="px-3 pb-3 pt-1 text-xs text-[#9e998e] whitespace-pre-wrap border-t border-[#2a2825] leading-relaxed">
                                {m.thinking_content}
                              </div>
                            )}
                          </div>
                        )}

                        <MarkdownRenderer content={cleanText} />

                        {artifacts.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {artifacts.map((art) => (
                              <button
                                key={art.id}
                                type="button"
                                onClick={() => setActiveArtifact(art)}
                                className="inline-flex items-center gap-2 rounded-xl border border-[#d97757]/40 bg-[#d97757]/10 hover:bg-[#d97757]/20 px-3 py-2 text-xs font-medium text-[#f3c6b6] transition-colors cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-[#d97757]" />
                                <span>{art.title}</span>
                                <span className="text-[10px] text-[#b7b3aa]">
                                  プレビュー
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#78736a]">
                          {m.model && <span>{m.model}</span>}
                          {m.connection_type && (
                            <span>
                              ・
                              {m.connection_type === "claude_cli"
                                ? "プラン契約(CLI)"
                                : "従量課金(API)"}
                            </span>
                          )}
                          {(m.input_tokens > 0 || m.output_tokens > 0) && (
                            <span>
                              ・in {m.input_tokens.toLocaleString()} / out{" "}
                              {m.output_tokens.toLocaleString()} tok
                            </span>
                          )}
                          {!isStreaming && (
                            <button
                              type="button"
                              onClick={() => void handleRegenerate(m)}
                              className="inline-flex items-center gap-1 ml-1 text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
                              title="この回答を再生成"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>再生成</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isStreaming && (
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-lg bg-[#d97757]/15 border border-[#d97757]/30 flex items-center justify-center text-[#d97757] shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      {streamingThinking && (
                        <div className="rounded-xl border border-[#302d29] bg-[#1e1c1a] p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs text-[#d97757]">
                            <Brain className="w-3.5 h-3.5 animate-pulse" />
                            <span>思考中...</span>
                          </div>
                          <div className="text-xs text-[#9e998e] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                            {streamingThinking}
                          </div>
                        </div>
                      )}
                      {streamingText ? (
                        <MarkdownRenderer content={streamingText} />
                      ) : (
                        !streamingThinking && (
                          <span className="text-xs text-[#9e998e]">
                            Claude が応答を生成中...
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {chatError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-300">
                {chatError}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 p-2.5 sm:p-4 border-t border-[#2b2824] bg-[#191817]">
          <div className="max-w-3xl mx-auto rounded-2xl border border-[#35322e] bg-[#22201e] p-2.5 sm:p-3 focus-within:border-[#d97757]/70 transition-colors">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-[#302d29]">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4]"
                  >
                    <span className="truncate max-w-[160px]">{att.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-[#858077] hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                const isMobile =
                  typeof window !== "undefined" &&
                  (window.matchMedia("(pointer: coarse)").matches ||
                    window.innerWidth < 768);
                if (
                  !isMobile &&
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Claude にメッセージを送信..."
              className="w-full resize-none bg-transparent text-base sm:text-sm text-[#eceae4] placeholder-[#78736a] focus:outline-none"
            />

            <div className="flex items-end justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
                <label
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 sm:py-1 text-xs text-[#9e998e] hover:text-[#eceae4] hover:bg-[#2a2825] cursor-pointer"
                  title="画像・PDF・テキストファイルを添付"
                >
                  <Paperclip className="w-4 h-4" />
                  <span className="hidden sm:inline">添付 (PDF可)</span>
                  <span className="sm:hidden">添付</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,application/pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.yaml,.yml,.sql,.sh"
                    onChange={handleFileAttach}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setEnableThinking((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 sm:py-1 text-[11px] border transition-colors cursor-pointer ${
                    enableThinking
                      ? "bg-[#d97757]/15 border-[#d97757]/50 text-[#f3c6b6]"
                      : "border-transparent text-[#858077] hover:text-[#eceae4] hover:bg-[#2a2825]"
                  }`}
                  title="Extended Thinking (拡張思考)"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>思考</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEnableWebSearch((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 sm:py-1 text-[11px] border transition-colors cursor-pointer ${
                    enableWebSearch
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                      : "border-transparent text-[#858077] hover:text-[#eceae4] hover:bg-[#2a2825]"
                  }`}
                  title="Web 検索連携 (Anthropic API)"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Web</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEnableArtifacts((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 sm:py-1 text-[11px] border transition-colors cursor-pointer ${
                    enableArtifacts
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "border-transparent text-[#858077] hover:text-[#eceae4] hover:bg-[#2a2825]"
                  }`}
                  title="Artifacts プレビュー生成"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Artifact</span>
                </button>

                <select
                  value={responseStyle}
                  onChange={(e) => setResponseStyle(e.target.value)}
                  className="rounded-lg bg-[#191817] border border-[#302d29] px-2 py-1.5 sm:py-1 text-[11px] text-[#b7b3aa] focus:outline-none focus:border-[#d97757]"
                  title="回答スタイル"
                >
                  {RESPONSE_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="shrink-0">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 px-3 py-2 sm:py-1.5 text-xs font-medium text-red-200 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>停止</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!input.trim() && attachments.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#d97757] hover:bg-[#c86747] disabled:opacity-40 px-3.5 py-2 sm:py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>送信</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {activeArtifact && (
        <ArtifactPanel
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
        />
      )}

      {/* Modals */}
      {editingProject !== null && (
        <ProjectModal
          project={editingProject === "new" ? null : editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={(saved) => {
            setEditingProject(null);
            void loadProjects();
            if (!activeConvId) setDraftProjectId(saved.id);
          }}
          onDeleted={(deletedId) => {
            setEditingProject(null);
            if (selectedProjectId === deletedId) setSelectedProjectId(null);
            if (draftProjectId === deletedId) setDraftProjectId(null);
            void loadProjects();
            void loadConversations(
              selectedProjectId === deletedId ? null : selectedProjectId
            );
          }}
        />
      )}

      {showProfile && (
        <ProfileModal
          user={user}
          monthlyTokens={monthlyTokens}
          connections={connections}
          onClose={() => setShowProfile(false)}
          onUpdated={(updated) => {
            setUser(updated);
          }}
        />
      )}

      {showAdmin &&
        (user.role === "system_admin" || user.role === "team_admin") && (
          <AdminModal
            currentUserId={user.id}
            currentUserRole={user.role}
            currentTeamId={user.teamId}
            onClose={() => setShowAdmin(false)}
            onConnectionsChanged={() => void loadConnections()}
          />
        )}
    </div>
  );
}
