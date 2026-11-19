"use client";

import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Terminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  PublicConnection,
  PublicUser,
  TeamItem,
  UsageMonthlyItem,
  UserRole,
} from "@/types/app";

interface AdminModalProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentTeamId: string | null;
  onClose: () => void;
  onConnectionsChanged: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: "システム管理者",
  team_admin: "チーム管理者",
  member: "一般メンバー",
};

export function AdminModal({
  currentUserId,
  currentUserRole,
  currentTeamId,
  onClose,
  onConnectionsChanged,
}: AdminModalProps) {
  const isSystemAdmin = currentUserRole === "system_admin";
  const [tab, setTab] = useState<"users" | "teams" | "connections" | "usage">(
    "users"
  );
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [usageRecords, setUsageRecords] = useState<UsageMonthlyItem[]>([]);
  const [usageMonths, setUsageMonths] = useState<string[]>([]);
  const [selectedUsageMonth, setSelectedUsageMonth] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New team form
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamLimit, setNewTeamLimit] = useState("");

  // New user form
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("member");
  const [newUserTeamId, setNewUserTeamId] = useState<string>(
    currentTeamId ?? ""
  );
  const [newUserConnId, setNewUserConnId] = useState("");
  const [newTokenLimit, setNewTokenLimit] = useState("");

  // New connection form
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState<"anthropic_api" | "claude_cli">(
    "anthropic_api"
  );
  const [connScope, setConnScope] = useState<"global" | "team">(
    isSystemAdmin ? "global" : "team"
  );
  const [connTeamId, setConnTeamId] = useState<string>(currentTeamId ?? "");
  const [connApiKey, setConnApiKey] = useState("");
  const [connOauthToken, setConnOauthToken] = useState("");
  const [connBaseUrl, setConnBaseUrl] = useState("");
  const [connModelOverride, setConnModelOverride] = useState("");
  const [connMaxTokens, setConnMaxTokens] = useState("");
  const [connCliDir, setConnCliDir] = useState("");
  const [showConnAdvanced, setShowConnAdvanced] = useState(false);
  const [connDefault, setConnDefault] = useState(false);

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("member");
  const [editTeamId, setEditTeamId] = useState("");
  const [editTokenLimit, setEditTokenLimit] = useState("");

  // Edit team state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDesc, setEditTeamDesc] = useState("");
  const [editTeamLimit, setEditTeamLimit] = useState("");

  // Edit connection state
  const [editingConnId, setEditingConnId] = useState<string | null>(null);
  const [editConnName, setEditConnName] = useState("");
  const [editConnScope, setEditConnScope] = useState<"global" | "team">("global");
  const [editConnTeamId, setEditConnTeamId] = useState("");
  const [editConnIsActive, setEditConnIsActive] = useState(true);
  const [editConnSecret, setEditConnSecret] = useState("");
  const [editConnBaseUrl, setEditConnBaseUrl] = useState("");
  const [editConnModelOverride, setEditConnModelOverride] = useState("");
  const [editConnMaxTokens, setEditConnMaxTokens] = useState("");
  const [editConnCliDir, setEditConnCliDir] = useState("");

  const [testResults, setTestResults] = useState<
    Record<string, { loading: boolean; ok?: boolean; message?: string }>
  >({});

  const loadData = useCallback(async () => {
    try {
      const [uRes, tRes, cRes, usRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/teams"),
        fetch("/api/admin/connections"),
        fetch("/api/admin/usage"),
      ]);
      const uData = (await uRes.json()) as { users?: PublicUser[] };
      const tData = (await tRes.json()) as { teams?: TeamItem[] };
      const cData = (await cRes.json()) as {
        connections?: PublicConnection[];
      };
      const usData = (await usRes.json()) as {
        records?: UsageMonthlyItem[];
        months?: string[];
      };
      if (uData.users) setUsers(uData.users);
      if (tData.teams) {
        setTeams(tData.teams);
        if (!newUserTeamId && tData.teams.length > 0) {
          setNewUserTeamId(tData.teams[0].id);
        }
        if (!connTeamId && tData.teams.length > 0) {
          setConnTeamId(tData.teams[0].id);
        }
      }
      if (cData.connections) setConnections(cData.connections);
      if (usData.records) setUsageRecords(usData.records);
      if (usData.months) {
        setUsageMonths(usData.months);
      }
    } catch {
      setError("管理データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [newUserTeamId, connTeamId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/teams").then((r) => r.json()),
      fetch("/api/admin/connections").then((r) => r.json()),
      fetch("/api/admin/usage").then((r) => r.json()),
    ])
      .then(
        ([uData, tData, cData, usData]: [
          { users?: PublicUser[] },
          { teams?: TeamItem[] },
          { connections?: PublicConnection[] },
          { records?: UsageMonthlyItem[]; months?: string[] }
        ]) => {
          if (!active) return;
          if (uData.users) setUsers(uData.users);
          if (tData.teams) {
            setTeams(tData.teams);
            if (!currentTeamId && tData.teams.length > 0) {
              setNewUserTeamId(tData.teams[0].id);
              setConnTeamId(tData.teams[0].id);
            }
          }
          if (cData.connections) setConnections(cData.connections);
          if (usData.records) setUsageRecords(usData.records);
          if (usData.months) {
            setUsageMonths(usData.months);
            if (usData.months.length > 0) {
              setSelectedUsageMonth(usData.months[0]);
            }
          }
        }
      )
      .catch(() => {
        if (active) setError("管理データの取得に失敗しました。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentTeamId]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const limitNum = newTeamLimit.trim()
      ? Number.parseInt(newTeamLimit.trim(), 10)
      : null;

    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTeamName,
        description: newTeamDesc,
        monthlyTokenLimit:
          limitNum !== null && !Number.isNaN(limitNum) ? limitNum : null,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "チーム作成に失敗しました。");
      return;
    }
    setNewTeamName("");
    setNewTeamDesc("");
    setNewTeamLimit("");
    await loadData();
  };

  const handleToggleTeamActive = async (t: TeamItem) => {
    setError(null);
    const res = await fetch(`/api/admin/teams/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "更新に失敗しました。");
      return;
    }
    await loadData();
  };

  const handleDeleteTeam = async (t: TeamItem) => {
    if (!confirm(`チーム「${t.name}」を削除しますか？`)) return;
    setError(null);
    const res = await fetch(`/api/admin/teams/${t.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "削除に失敗しました。");
      return;
    }
    await loadData();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const limitNum = newTokenLimit.trim()
      ? Number.parseInt(newTokenLimit.trim(), 10)
      : null;

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: newUsername,
        displayName: newDisplayName || newUsername,
        password: newPassword,
        role: isSystemAdmin ? newRole : "member",
        teamId: isSystemAdmin ? newUserTeamId || null : currentTeamId,
        defaultConnectionId: newUserConnId || null,
        monthlyTokenLimit:
          limitNum !== null && !Number.isNaN(limitNum) ? limitNum : null,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "アカウント作成に失敗しました。");
      return;
    }
    setNewUsername("");
    setNewDisplayName("");
    setNewPassword("");
    setNewTokenLimit("");
    await loadData();
  };

  const startEditUser = (u: PublicUser) => {
    setEditingUserId(u.id);
    setEditUsername(u.username);
    setEditDisplayName(u.displayName);
    setEditRole(u.role);
    setEditTeamId(u.teamId ?? "");
    setEditTokenLimit(
      u.monthlyTokenLimit !== null ? String(u.monthlyTokenLimit) : ""
    );
  };

  const handleSaveUserEdit = async (u: PublicUser) => {
    setError(null);
    const limitNum = editTokenLimit.trim()
      ? Number.parseInt(editTokenLimit.trim(), 10)
      : null;

    const payload: Record<string, unknown> = {
      username: editUsername,
      displayName: editDisplayName,
      monthlyTokenLimit:
        limitNum !== null && !Number.isNaN(limitNum) ? limitNum : null,
    };
    if (isSystemAdmin) {
      if (u.id !== currentUserId) {
        payload.role = editRole;
      }
      payload.teamId = editTeamId || null;
    }

    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "アカウント更新に失敗しました。");
      return;
    }
    setEditingUserId(null);
    await loadData();
  };

  const startEditTeam = (t: TeamItem) => {
    setEditingTeamId(t.id);
    setEditTeamName(t.name);
    setEditTeamDesc(t.description);
    setEditTeamLimit(
      t.monthlyTokenLimit !== null ? String(t.monthlyTokenLimit) : ""
    );
  };

  const handleSaveTeamEdit = async (t: TeamItem) => {
    setError(null);
    const limitNum = editTeamLimit.trim()
      ? Number.parseInt(editTeamLimit.trim(), 10)
      : null;
    const res = await fetch(`/api/admin/teams/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editTeamName,
        description: editTeamDesc,
        monthlyTokenLimit:
          limitNum !== null && !Number.isNaN(limitNum) ? limitNum : null,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "チーム更新に失敗しました。");
      return;
    }
    setEditingTeamId(null);
    await loadData();
  };

  const startEditConn = (c: PublicConnection) => {
    setEditingConnId(c.id);
    setEditConnName(c.name);
    setEditConnScope(c.scope);
    setEditConnTeamId(c.teamId ?? teams[0]?.id ?? "");
    setEditConnIsActive(c.isActive);
    setEditConnSecret("");
    setEditConnBaseUrl(c.baseUrl ?? "");
    setEditConnModelOverride(c.defaultModelOverride ?? "");
    setEditConnMaxTokens(c.maxTokens !== null ? String(c.maxTokens) : "");
    setEditConnCliDir(c.cliConfigDir ?? "");
  };

  const handleSaveConnEdit = async (c: PublicConnection) => {
    setError(null);
    const maxTokNum = editConnMaxTokens.trim()
      ? Number.parseInt(editConnMaxTokens.trim(), 10)
      : null;
    const payload: Record<string, unknown> = {
      name: editConnName,
      isActive: editConnIsActive,
      baseUrl: editConnBaseUrl.trim() || null,
      defaultModelOverride: editConnModelOverride.trim() || null,
      maxTokens:
        maxTokNum !== null && !Number.isNaN(maxTokNum) && maxTokNum > 0
          ? maxTokNum
          : null,
    };
    if (isSystemAdmin) {
      payload.scope = editConnScope;
      payload.teamId = editConnScope === "team" ? editConnTeamId || null : null;
    }
    if (c.type === "anthropic_api" && editConnSecret.trim()) {
      payload.apiKey = editConnSecret.trim();
    }
    if (c.type === "claude_cli") {
      if (editConnSecret.trim()) {
        payload.oauthToken = editConnSecret.trim();
      }
      payload.cliConfigDir = editConnCliDir.trim() || null;
    }

    const res = await fetch(`/api/admin/connections/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "接続の更新に失敗しました。");
      return;
    }
    setEditingConnId(null);
    await loadData();
    onConnectionsChanged();
  };

  const handleToggleUserActive = async (u: PublicUser) => {
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "更新に失敗しました。");
      return;
    }
    await loadData();
  };

  const handleResetPassword = async (u: PublicUser) => {
    const pw = prompt(
      `${u.displayName} (${u.username}) の新しいパスワード（6文字以上）:`
    );
    if (!pw) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "パスワード変更に失敗しました。");
      return;
    }
    alert("パスワードを更新しました。");
  };

  const handleDeleteUser = async (u: PublicUser) => {
    if (
      !confirm(
        `仮想アカウント「${u.displayName} (@${u.username})」を削除しますか？`
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "削除に失敗しました。");
      return;
    }
    await loadData();
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const maxTokNum = connMaxTokens.trim()
      ? Number.parseInt(connMaxTokens.trim(), 10)
      : null;
    const res = await fetch("/api/admin/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: connName,
        type: connType,
        scope: isSystemAdmin ? connScope : "team",
        teamId:
          isSystemAdmin && connScope === "global"
            ? null
            : isSystemAdmin
            ? connTeamId || null
            : currentTeamId,
        apiKey: connType === "anthropic_api" ? connApiKey : undefined,
        oauthToken: connType === "claude_cli" ? connOauthToken : undefined,
        baseUrl: connBaseUrl.trim() || undefined,
        defaultModelOverride: connModelOverride.trim() || undefined,
        maxTokens:
          maxTokNum !== null && !Number.isNaN(maxTokNum) && maxTokNum > 0
            ? maxTokNum
            : undefined,
        cliConfigDir: connType === "claude_cli" ? connCliDir : undefined,
        isDefault: isSystemAdmin ? connDefault : false,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "接続の追加に失敗しました。");
      return;
    }
    setConnName("");
    setConnApiKey("");
    setConnOauthToken("");
    setConnBaseUrl("");
    setConnModelOverride("");
    setConnMaxTokens("");
    setConnCliDir("");
    setConnDefault(false);
    await loadData();
    onConnectionsChanged();
  };

  const handleSetDefaultConnection = async (c: PublicConnection) => {
    await fetch(`/api/admin/connections/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true, isActive: true }),
    });
    await loadData();
    onConnectionsChanged();
  };

  const handleDeleteConnection = async (c: PublicConnection) => {
    if (!confirm(`接続「${c.name}」を削除しますか？`)) return;
    const res = await fetch(`/api/admin/connections/${c.id}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "削除に失敗しました。");
      return;
    }
    await loadData();
    onConnectionsChanged();
  };

  const handleTestConnection = async (c: PublicConnection) => {
    setTestResults((prev) => ({ ...prev, [c.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/admin/connections/${c.id}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setTestResults((prev) => ({
        ...prev,
        [c.id]: {
          loading: false,
          ok: Boolean(data.ok),
          message: data.message || (data.ok ? "成功" : "失敗"),
        },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [c.id]: { loading: false, ok: false, message: "テスト通信エラー" },
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-[#35322e] bg-[#22201e] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#302d29]">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#d97757]" />
            <h2 className="text-base font-semibold text-[#faf9f5]">
              {isSystemAdmin ? "システム管理パネル" : "チーム管理パネル"}
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

        <div className="flex gap-1 px-6 pt-3 border-b border-[#302d29] bg-[#1e1c1a] overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === "users"
                ? "border-[#d97757] text-[#faf9f5]"
                : "border-transparent text-[#9e998e] hover:text-[#eceae4]"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>
              {isSystemAdmin ? "仮想アカウント" : "チームメンバー"} ({users.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("teams")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === "teams"
                ? "border-[#d97757] text-[#faf9f5]"
                : "border-transparent text-[#9e998e] hover:text-[#eceae4]"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>
              {isSystemAdmin ? "チーム管理" : "自チーム状況"} ({teams.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("connections")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === "connections"
                ? "border-[#d97757] text-[#faf9f5]"
                : "border-transparent text-[#9e998e] hover:text-[#eceae4]"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Claude接続先 ({connections.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("usage")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === "usage"
                ? "border-[#d97757] text-[#faf9f5]"
                : "border-transparent text-[#9e998e] hover:text-[#eceae4]"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>利用状況レポート</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-[#9e998e]">
              読み込み中...
            </div>
          ) : tab === "users" ? (
            <>
              <form
                onSubmit={handleCreateUser}
                className="rounded-xl border border-[#302d29] bg-[#191817] p-4 space-y-3"
              >
                <div className="text-xs font-semibold text-[#faf9f5] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#d97757]" />
                  <span>
                    {isSystemAdmin
                      ? "新規仮想アカウントを発行"
                      : "自チームに新規メンバーを追加"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ユーザー名 (半角英数)"
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="表示名 (例: 田中 太郎)"
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="初期パスワード (6文字以上)"
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center">
                  {isSystemAdmin ? (
                    <>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                      >
                        <option value="member">一般メンバー</option>
                        <option value="team_admin">チーム管理者</option>
                        <option value="system_admin">システム管理者</option>
                      </select>
                      <select
                        value={newUserTeamId}
                        onChange={(e) => setNewUserTeamId(e.target.value)}
                        className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                      >
                        <option value="">チームなし</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <select
                      value={newUserConnId}
                      onChange={(e) => setNewUserConnId(e.target.value)}
                      className="sm:col-span-2 rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    >
                      <option value="">接続先: システム標準</option>
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min={0}
                    value={newTokenLimit}
                    onChange={(e) => setNewTokenLimit(e.target.value)}
                    placeholder="月間トークン上限 (空=無制限)"
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                  >
                    アカウント作成
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {users.map((u) => {
                  const canManageTarget =
                    u.id !== currentUserId &&
                    (isSystemAdmin || u.role === "member");
                  const canEditTarget =
                    isSystemAdmin ||
                    u.id === currentUserId ||
                    u.role === "member";
                  const isEditing = editingUserId === u.id;

                  return (
                    <div
                      key={u.id}
                      className="rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-[#faf9f5]">
                              {u.displayName}
                            </span>
                            <span className="text-xs font-mono text-[#858077]">
                              @{u.username}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                u.role === "system_admin"
                                  ? "bg-[#d97757]/25 text-[#f3c6b6]"
                                  : u.role === "team_admin"
                                  ? "bg-sky-500/20 text-sky-300"
                                  : "bg-[#302d29] text-[#b7b3aa]"
                              }`}
                            >
                              {ROLE_LABELS[u.role]}
                            </span>
                            {u.teamName && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#252320] text-[#b7b3aa]">
                                {u.teamName}
                              </span>
                            )}
                            {!u.isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300">
                                無効
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#9e998e] mt-1">
                            今月トークン: {u.monthlyTokens.toLocaleString()}
                            {u.monthlyTokenLimit !== null
                              ? ` / ${u.monthlyTokenLimit.toLocaleString()}`
                              : " (上限なし)"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canEditTarget && (
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setEditingUserId(null)
                                  : startEditUser(u)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#eceae4] hover:bg-[#2a2825] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{isEditing ? "閉じる" : "編集"}</span>
                            </button>
                          )}
                          {canEditTarget && (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u)}
                              className="rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
                            >
                              PW変更
                            </button>
                          )}
                          {canManageTarget && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserActive(u)}
                                className="rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
                              >
                                {u.isActive ? "無効化" : "有効化"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 text-[#858077] hover:text-red-400 cursor-pointer"
                                title="削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="pt-3 border-t border-[#2a2825] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              ユーザー名 (半角英数)
                            </label>
                            <input
                              type="text"
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              表示名
                            </label>
                            <input
                              type="text"
                              value={editDisplayName}
                              onChange={(e) =>
                                setEditDisplayName(e.target.value)
                              }
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          {isSystemAdmin && (
                            <>
                              <div>
                                <label className="block text-[10px] text-[#858077] mb-1">
                                  権限
                                </label>
                                <select
                                  value={editRole}
                                  disabled={u.id === currentUserId}
                                  onChange={(e) =>
                                    setEditRole(e.target.value as UserRole)
                                  }
                                  className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4] disabled:opacity-50"
                                >
                                  <option value="member">一般メンバー</option>
                                  <option value="team_admin">
                                    チーム管理者
                                  </option>
                                  <option value="system_admin">
                                    システム管理者
                                  </option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#858077] mb-1">
                                  所属チーム
                                </label>
                                <select
                                  value={editTeamId}
                                  onChange={(e) =>
                                    setEditTeamId(e.target.value)
                                  }
                                  className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                                >
                                  <option value="">チームなし</option>
                                  {teams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              月間トークン上限 (空=無制限)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={editTokenLimit}
                              onChange={(e) =>
                                setEditTokenLimit(e.target.value)
                              }
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div className="flex items-end justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="rounded-lg border border-[#35322e] px-3 py-1.5 text-xs text-[#b7b3aa] cursor-pointer"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveUserEdit(u)}
                              className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                            >
                              変更を保存
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : tab === "teams" ? (
            <>
              {isSystemAdmin && (
                <form
                  onSubmit={handleCreateTeam}
                  className="rounded-xl border border-[#302d29] bg-[#191817] p-4 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#faf9f5] flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-[#d97757]" />
                    <span>新規チームを作成</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="チーム名（例: 開発チーム）"
                      className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                    />
                    <input
                      type="text"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      placeholder="説明（任意）"
                      className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={newTeamLimit}
                        onChange={(e) => setNewTeamLimit(e.target.value)}
                        placeholder="月間上限 (空=無制限)"
                        className="flex-1 rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {teams.map((t) => {
                  const isEditing = editingTeamId === t.id;
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#faf9f5]">
                              {t.name}
                            </span>
                            {!t.isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300">
                                無効
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <div className="text-xs text-[#9e998e] mt-0.5">
                              {t.description}
                            </div>
                          )}
                          <div className="text-[11px] text-[#858077] mt-1 flex gap-4">
                            <span>メンバー数: {t.memberCount ?? 0}</span>
                            <span>
                              今月トークン: {t.monthlyTokens.toLocaleString()}
                              {t.monthlyTokenLimit !== null
                                ? ` / ${t.monthlyTokenLimit.toLocaleString()}`
                                : " (上限なし)"}
                            </span>
                          </div>
                        </div>

                        {isSystemAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setEditingTeamId(null)
                                  : startEditTeam(t)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#eceae4] hover:bg-[#2a2825] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{isEditing ? "閉じる" : "編集"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleTeamActive(t)}
                              className="rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
                            >
                              {t.isActive ? "無効化" : "有効化"}
                            </button>
                            {t.id !== currentTeamId && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTeam(t)}
                                className="p-1.5 text-[#858077] hover:text-red-400 cursor-pointer"
                                title="削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {isEditing && isSystemAdmin && (
                        <div className="pt-3 border-t border-[#2a2825] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              チーム名
                            </label>
                            <input
                              type="text"
                              value={editTeamName}
                              onChange={(e) => setEditTeamName(e.target.value)}
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              説明
                            </label>
                            <input
                              type="text"
                              value={editTeamDesc}
                              onChange={(e) => setEditTeamDesc(e.target.value)}
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              月間トークン上限 (空=無制限)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={editTeamLimit}
                              onChange={(e) => setEditTeamLimit(e.target.value)}
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div className="sm:col-span-3 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTeamId(null)}
                              className="rounded-lg border border-[#35322e] px-3 py-1.5 text-xs text-[#b7b3aa] cursor-pointer"
                            >
                              キャンセル
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveTeamEdit(t)}
                              className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                            >
                              変更を保存
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : tab === "usage" ? (
            (() => {
              const filtered =
                selectedUsageMonth === "all"
                  ? usageRecords
                  : usageRecords.filter((r) => r.month === selectedUsageMonth);

              // Aggregate by user_id
              const byUser = new Map<
                string,
                {
                  userId: string;
                  inputTokens: number;
                  outputTokens: number;
                  totalTokens: number;
                  cliTokens: number;
                  apiCostUsd: number;
                  models: Record<
                    string,
                    {
                      input_tokens: number;
                      output_tokens: number;
                      cost_usd: number;
                      connection_type: string;
                    }
                  >;
                }
              >();

              let grandTotalTokens = 0;
              let grandCliTokens = 0;
              let grandApiCost = 0;

              for (const rec of filtered) {
                grandTotalTokens += rec.total_tokens;
                grandCliTokens += rec.cli_tokens;
                grandApiCost += rec.api_cost_usd;

                const cur = byUser.get(rec.user_id) ?? {
                  userId: rec.user_id,
                  inputTokens: 0,
                  outputTokens: 0,
                  totalTokens: 0,
                  cliTokens: 0,
                  apiCostUsd: 0,
                  models: {},
                };
                cur.inputTokens += rec.input_tokens;
                cur.outputTokens += rec.output_tokens;
                cur.totalTokens += rec.total_tokens;
                cur.cliTokens += rec.cli_tokens;
                cur.apiCostUsd += rec.api_cost_usd;

                for (const [mKey, mVal] of Object.entries(rec.by_model ?? {})) {
                  const prev = cur.models[mKey] ?? {
                    input_tokens: 0,
                    output_tokens: 0,
                    cost_usd: 0,
                    connection_type: mVal.connection_type,
                  };
                  cur.models[mKey] = {
                    input_tokens: prev.input_tokens + mVal.input_tokens,
                    output_tokens: prev.output_tokens + mVal.output_tokens,
                    cost_usd: prev.cost_usd + mVal.cost_usd,
                    connection_type: mVal.connection_type,
                  };
                }
                byUser.set(rec.user_id, cur);
              }

              const rows = Array.from(byUser.values()).sort(
                (a, b) => b.totalTokens - a.totalTokens
              );

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-[#9e998e]">
                      当月・過去の月ごとのユーザー別利用状況（モデル別単価に基づく概算 API 料金、プラン契約枠は $0）
                    </div>
                    <select
                      value={selectedUsageMonth}
                      onChange={(e) => setSelectedUsageMonth(e.target.value)}
                      className="rounded-lg bg-[#191817] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    >
                      <option value="all">全期間合計</option>
                      {usageMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[#302d29] bg-[#191817] p-3.5">
                      <div className="text-[11px] text-[#858077]">総トークン</div>
                      <div className="text-base font-semibold font-mono text-[#faf9f5] mt-1">
                        {grandTotalTokens.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#302d29] bg-[#191817] p-3.5">
                      <div className="text-[11px] text-[#858077]">
                        プラン契約枠 (定額)
                      </div>
                      <div className="text-base font-semibold font-mono text-emerald-300 mt-1">
                        {grandCliTokens.toLocaleString()} tok
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#302d29] bg-[#191817] p-3.5">
                      <div className="text-[11px] text-[#858077]">
                        API 概算料金合計
                      </div>
                      <div className="text-base font-semibold font-mono text-[#f3c6b6] mt-1">
                        ${grandApiCost.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#35322e] py-10 text-center text-xs text-[#858077]">
                      この期間の利用データはまだありません
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {rows.map((r) => {
                        const uInfo = users.find((u) => u.id === r.userId);
                        const modelEntries = Object.entries(r.models);
                        return (
                          <div
                            key={r.userId}
                            className="rounded-xl border border-[#302d29] bg-[#191817] p-4 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[#faf9f5]">
                                  {uInfo?.displayName || r.userId}
                                </span>
                                {uInfo && (
                                  <span className="text-xs font-mono text-[#858077]">
                                    @{uInfo.username}
                                  </span>
                                )}
                                {uInfo?.teamName && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#252320] text-[#b7b3aa]">
                                    {uInfo.teamName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="font-mono text-[#b7b3aa]">
                                  {r.totalTokens.toLocaleString()} tok
                                </span>
                                <span className="px-2 py-0.5 rounded bg-[#d97757]/15 text-[#f3c6b6] font-mono">
                                  API: ${r.apiCostUsd.toFixed(4)}
                                </span>
                              </div>
                            </div>

                            <div className="text-[11px] text-[#858077] flex flex-wrap gap-x-4 gap-y-1">
                              <span>入力: {r.inputTokens.toLocaleString()}</span>
                              <span>出力: {r.outputTokens.toLocaleString()}</span>
                              <span>
                                プラン枠: {r.cliTokens.toLocaleString()} tok
                              </span>
                            </div>

                            {modelEntries.length > 0 && (
                              <div className="pt-2 border-t border-[#2a2825] space-y-1">
                                {modelEntries.map(([mKey, mVal]) => {
                                  const mName = mKey.split("__")[0];
                                  return (
                                    <div
                                      key={mKey}
                                      className="flex items-center justify-between text-[11px] text-[#9e998e]"
                                    >
                                      <span className="truncate max-w-[260px]">
                                        {mName} (
                                        {mVal.connection_type === "claude_cli"
                                          ? "プラン"
                                          : "API"}
                                        )
                                      </span>
                                      <span className="font-mono">
                                        in {mVal.input_tokens.toLocaleString()} /
                                        out {mVal.output_tokens.toLocaleString()}{" "}
                                        (${mVal.cost_usd.toFixed(4)})
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              <form
                onSubmit={handleCreateConnection}
                className="rounded-xl border border-[#302d29] bg-[#191817] p-4 space-y-3"
              >
                <div className="text-xs font-semibold text-[#faf9f5] flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#d97757]" />
                  <span>
                    {isSystemAdmin
                      ? "新規Claude接続先を追加"
                      : "自チーム専用のClaude接続先を追加"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={connName}
                    onChange={(e) => setConnName(e.target.value)}
                    placeholder="接続名（例: 共通 Anthropic API）"
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <select
                    value={connType}
                    onChange={(e) =>
                      setConnType(
                        e.target.value as "claude_cli" | "anthropic_api"
                      )
                    }
                    className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                  >
                    <option value="anthropic_api">
                      従量課金 (Anthropic APIキー)
                    </option>
                    <option value="claude_cli">
                      プラン契約 (Claude Code CLI — セルフホスト向け)
                    </option>
                  </select>
                </div>

                {isSystemAdmin && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                      value={connScope}
                      onChange={(e) =>
                        setConnScope(e.target.value as "global" | "team")
                      }
                      className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    >
                      <option value="global">全体共通 (全チームで利用可)</option>
                      <option value="team">特定チーム専用</option>
                    </select>
                    {connScope === "team" && (
                      <select
                        value={connTeamId}
                        onChange={(e) => setConnTeamId(e.target.value)}
                        className="rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                      >
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {connType === "anthropic_api" ? (
                  <input
                    type="password"
                    value={connApiKey}
                    onChange={(e) => setConnApiKey(e.target.value)}
                    placeholder="APIキー: sk-ant-...（環境変数を使う場合は空欄）"
                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                  />
                ) : (
                  <input
                    type="password"
                    value={connOauthToken}
                    onChange={(e) => setConnOauthToken(e.target.value)}
                    placeholder="OAuthトークン: sk-ant-oat01-...（`claude setup-token` で発行）"
                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                  />
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => setShowConnAdvanced((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
                  >
                    {showConnAdvanced ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <span>詳細オプション（互換 Base URL / カスタムモデル / CLIディレクトリ）</span>
                  </button>

                  {showConnAdvanced && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-[#302d29] bg-[#22201e] p-3">
                      <div>
                        <label className="block text-[10px] text-[#858077] mb-1">
                          互換 Base URL（標準: https://api.anthropic.com）
                        </label>
                        <input
                          type="url"
                          value={connBaseUrl}
                          onChange={(e) => setConnBaseUrl(e.target.value)}
                          placeholder="https://api.anthropic.com"
                          className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#858077] mb-1">
                          この接続先のデフォルトモデル ID（任意）
                        </label>
                        <input
                          type="text"
                          value={connModelOverride}
                          onChange={(e) => setConnModelOverride(e.target.value)}
                          placeholder="例: anthropic/claude-sonnet-4.5"
                          className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#858077] mb-1">
                          最大出力トークン max_tokens（空=8192）
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={connMaxTokens}
                          onChange={(e) => setConnMaxTokens(e.target.value)}
                          placeholder="8192"
                          className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4]"
                        />
                      </div>
                      {connType === "claude_cli" && (
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-[#858077] mb-1">
                            ローカル認証ディレクトリ (CLAUDE_CONFIG_DIR)
                          </label>
                          <input
                            type="text"
                            value={connCliDir}
                            onChange={(e) => setConnCliDir(e.target.value)}
                            placeholder="OAuthトークンを使う場合は空欄"
                            className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-2.5 py-1 text-xs text-[#eceae4]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {isSystemAdmin ? (
                    <label className="inline-flex items-center gap-2 text-xs text-[#b7b3aa] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={connDefault}
                        onChange={(e) => setConnDefault(e.target.checked)}
                      />
                      <span>システムデフォルトにする</span>
                    </label>
                  ) : (
                    <span />
                  )}
                  <button
                    type="submit"
                    className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-4 py-1.5 text-xs font-medium text-white cursor-pointer"
                  >
                    接続先を追加
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {connections.map((c) => {
                  const tr = testResults[c.id];
                  const canEditConn =
                    isSystemAdmin ||
                    (c.scope === "team" && c.teamId === currentTeamId);
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.type === "claude_cli" ? (
                            <Terminal className="w-4 h-4 text-[#d97757]" />
                          ) : (
                            <KeyRound className="w-4 h-4 text-sky-400" />
                          )}
                          <span className="text-sm font-medium text-[#faf9f5]">
                            {c.name}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#2a2825] text-[#b7b3aa]">
                            {c.scope === "global" ? "全体共通" : "チーム専用"}
                          </span>
                          {c.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              デフォルト
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTestConnection(c)}
                            disabled={tr?.loading}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#eceae4] hover:bg-[#2a2825] cursor-pointer"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                tr?.loading ? "animate-spin" : ""
                              }`}
                            />
                            <span>接続テスト</span>
                          </button>
                          {isSystemAdmin && !c.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultConnection(c)}
                              className="rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
                            >
                              標準にする
                            </button>
                          )}
                          {canEditConn && (
                            <button
                              type="button"
                              onClick={() =>
                                editingConnId === c.id
                                  ? setEditingConnId(null)
                                  : startEditConn(c)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#35322e] px-2.5 py-1 text-[11px] text-[#eceae4] hover:bg-[#2a2825] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>
                                {editingConnId === c.id ? "閉じる" : "編集"}
                              </span>
                            </button>
                          )}
                          {canEditConn && (
                            <button
                              type="button"
                              onClick={() => handleDeleteConnection(c)}
                              className="p-1.5 text-[#858077] hover:text-red-400 cursor-pointer"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-[#858077] space-y-0.5">
                        <div>
                          {c.type === "claude_cli"
                            ? c.hasOauthToken
                              ? "認証: OAuth トークン (CLAUDE_CODE_OAUTH_TOKEN) 保存済み"
                              : `認証ディレクトリ: ${
                                  c.cliConfigDir || "~/.claude (デフォルト)"
                                }`
                            : `APIキー: ${
                                c.hasCustomApiKey
                                  ? "暗号化して保存済み"
                                  : "環境変数 ANTHROPIC_API_KEY"
                              }`}
                        </div>
                        {(c.baseUrl || c.defaultModelOverride) && (
                          <div className="text-[#9e998e]">
                            {c.baseUrl && <span>Base URL: {c.baseUrl}</span>}
                            {c.baseUrl && c.defaultModelOverride && " ・ "}
                            {c.defaultModelOverride && (
                              <span>モデル: {c.defaultModelOverride}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {editingConnId === c.id && (
                        <div className="pt-3 border-t border-[#2a2825] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              接続名
                            </label>
                            <input
                              type="text"
                              value={editConnName}
                              onChange={(e) => setEditConnName(e.target.value)}
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              {c.type === "anthropic_api"
                                ? "APIキー差し替え（変更しない場合は空欄）"
                                : "OAuthトークン差し替え（変更しない場合は空欄）"}
                            </label>
                            <input
                              type="password"
                              value={editConnSecret}
                              onChange={(e) =>
                                setEditConnSecret(e.target.value)
                              }
                              placeholder="変更時のみ入力"
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              互換 Base URL（空欄=Anthropic標準）
                            </label>
                            <input
                              type="url"
                              value={editConnBaseUrl}
                              onChange={(e) =>
                                setEditConnBaseUrl(e.target.value)
                              }
                              placeholder="https://api.anthropic.com"
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              この接続先のデフォルトモデル ID（任意）
                            </label>
                            <input
                              type="text"
                              value={editConnModelOverride}
                              onChange={(e) =>
                                setEditConnModelOverride(e.target.value)
                              }
                              placeholder="例: anthropic/claude-sonnet-4.5"
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#858077] mb-1">
                              最大出力トークン max_tokens（空=8192）
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={editConnMaxTokens}
                              onChange={(e) =>
                                setEditConnMaxTokens(e.target.value)
                              }
                              placeholder="8192"
                              className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                            />
                          </div>
                          {c.type === "claude_cli" && (
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] text-[#858077] mb-1">
                                ローカル認証ディレクトリ (CLAUDE_CONFIG_DIR)
                              </label>
                              <input
                                type="text"
                                value={editConnCliDir}
                                onChange={(e) =>
                                  setEditConnCliDir(e.target.value)
                                }
                                placeholder="OAuthトークン利用時は空欄"
                                className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                              />
                            </div>
                          )}
                          {isSystemAdmin && (
                            <>
                              <div>
                                <label className="block text-[10px] text-[#858077] mb-1">
                                  公開スコープ
                                </label>
                                <select
                                  value={editConnScope}
                                  onChange={(e) =>
                                    setEditConnScope(
                                      e.target.value as "global" | "team"
                                    )
                                  }
                                  className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                                >
                                  <option value="global">全体共通</option>
                                  <option value="team">特定チーム専用</option>
                                </select>
                              </div>
                              {editConnScope === "team" && (
                                <div>
                                  <label className="block text-[10px] text-[#858077] mb-1">
                                    対象チーム
                                  </label>
                                  <select
                                    value={editConnTeamId}
                                    onChange={(e) =>
                                      setEditConnTeamId(e.target.value)
                                    }
                                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-2.5 py-1.5 text-xs text-[#eceae4]"
                                  >
                                    {teams.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </>
                          )}
                          <div className="sm:col-span-2 flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-xs text-[#b7b3aa] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editConnIsActive}
                                onChange={(e) =>
                                  setEditConnIsActive(e.target.checked)
                                }
                              />
                              <span>この接続先を有効にする</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingConnId(null)}
                                className="rounded-lg border border-[#35322e] px-3 py-1.5 text-xs text-[#b7b3aa] cursor-pointer"
                              >
                                キャンセル
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveConnEdit(c)}
                                className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                              >
                                変更を保存
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {tr && !tr.loading && (
                        <div
                          className={`text-xs px-2.5 py-1.5 rounded-lg ${
                            tr.ok
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-300 border border-red-500/20"
                          }`}
                        >
                          {tr.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
