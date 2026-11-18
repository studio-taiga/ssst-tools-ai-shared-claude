"use client";

import {
  Building2,
  CheckCircle2,
  KeyRound,
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
  const [tab, setTab] = useState<"users" | "teams" | "connections">("users");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [connections, setConnections] = useState<PublicConnection[]>([]);
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
  const [connCliDir, setConnCliDir] = useState("");
  const [connDefault, setConnDefault] = useState(false);

  const [testResults, setTestResults] = useState<
    Record<string, { loading: boolean; ok?: boolean; message?: string }>
  >({});

  const loadData = useCallback(async () => {
    try {
      const [uRes, tRes, cRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/teams"),
        fetch("/api/admin/connections"),
      ]);
      const uData = (await uRes.json()) as { users?: PublicUser[] };
      const tData = (await tRes.json()) as { teams?: TeamItem[] };
      const cData = (await cRes.json()) as {
        connections?: PublicConnection[];
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
    ])
      .then(
        ([uData, tData, cData]: [
          { users?: PublicUser[] },
          { teams?: TeamItem[] },
          { connections?: PublicConnection[] }
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

        <div className="flex gap-1 px-6 pt-3 border-b border-[#302d29] bg-[#1e1c1a]">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
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
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
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
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              tab === "connections"
                ? "border-[#d97757] text-[#faf9f5]"
                : "border-transparent text-[#9e998e] hover:text-[#eceae4]"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Claude接続先 ({connections.length})</span>
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
                  return (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3"
                    >
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
                        {(isSystemAdmin ||
                          u.id === currentUserId ||
                          u.role === "member") && (
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
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#302d29] bg-[#191817] px-4 py-3"
                  >
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
                ))}
              </div>
            </>
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
                    placeholder="sk-ant-...（環境変数 ANTHROPIC_API_KEY を使う場合は空欄）"
                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                  />
                ) : (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={connOauthToken}
                      onChange={(e) => setConnOauthToken(e.target.value)}
                      placeholder="sk-ant-oat01-...（CLAUDE_CODE_OAUTH_TOKEN: `claude setup-token` で発行）"
                      className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    />
                    <input
                      type="text"
                      value={connCliDir}
                      onChange={(e) => setConnCliDir(e.target.value)}
                      placeholder="CLAUDE_CONFIG_DIR（OAuthトークンを使う場合は空欄でOK）"
                      className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4]"
                    />
                    <p className="text-[11px] text-[#858077]">
                      ※手元の端末で{" "}
                      <code className="px-1 rounded bg-[#22201e]">
                        npx -y @anthropic-ai/claude-code setup-token
                      </code>{" "}
                      を1回実行して発行した長期トークン（約1年有効）を登録すると、自宅PCを起動し続けずにクラウドからプラン枠を利用できます。
                    </p>
                  </div>
                )}

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
                              onClick={() => handleDeleteConnection(c)}
                              className="p-1.5 text-[#858077] hover:text-red-400 cursor-pointer"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-[#858077]">
                        {c.type === "claude_cli"
                          ? c.hasOauthToken
                            ? "認証: OAuth トークン (CLAUDE_CODE_OAUTH_TOKEN) 暗号化保存済み"
                            : `設定ディレクトリ: ${
                                c.cliConfigDir || "~/.claude (デフォルト)"
                              }`
                          : `APIキー: ${
                              c.hasCustomApiKey
                                ? "暗号化して保存済み"
                                : "環境変数 ANTHROPIC_API_KEY"
                            }`}
                      </div>

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
