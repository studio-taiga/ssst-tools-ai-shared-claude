"use client";

import { FileText, FolderPlus, Plus, Trash2, Upload, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { extractTextFromPdf } from "@/lib/pdf-extract";
import { ProjectFileItem, ProjectItem } from "@/types/app";

interface ProjectModalProps {
  project: ProjectItem | null; // null = create new
  onClose: () => void;
  onSaved: (project: ProjectItem) => void;
  onDeleted?: (projectId: string) => void;
}

export function ProjectModal({
  project,
  onClose,
  onSaved,
  onDeleted,
}: ProjectModalProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    project?.system_prompt ?? ""
  );
  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [newFilename, setNewFilename] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [showAddText, setShowAddText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((data: { files?: ProjectFileItem[] }) => {
        if (data.files) setFiles(data.files);
      })
      .catch(() => {});
  }, [project]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const url = project ? `/api/projects/${project.id}` : "/api/projects";
      const method = project ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, systemPrompt }),
      });
      const data = (await res.json()) as {
        project?: ProjectItem;
        error?: string;
      };
      if (!res.ok || !data.project) {
        setError(data.error || "保存に失敗しました。");
        return;
      }
      onSaved(data.project);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  const processKnowledgeFiles = async (fileList: FileList | File[]) => {
    if (!project) return;
    const targetFiles = Array.from(fileList);
    if (targetFiles.length === 0) return;
    setError(null);
    for (const file of targetFiles) {
      try {
        let filename = file.name;
        let text = "";
        if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          const extracted = await extractTextFromPdf(file);
          filename = `${file.name} (${extracted.pageCount}p)`;
          text = extracted.text;
        } else {
          text = await file.text();
        }
        const res = await fetch(`/api/projects/${project.id}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, content: text }),
        });
        const data = (await res.json()) as {
          file?: ProjectFileItem;
          error?: string;
        };
        if (!res.ok || !data.file) {
          setError(data.error || `${file.name} の追加に失敗しました。`);
        } else {
          setFiles((prev) => [data.file!, ...prev]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `${file.name} の読み込みに失敗しました。`
        );
      }
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await processKnowledgeFiles(e.target.files);
    e.target.value = "";
  };

  const handleAddTextKnowledge = async () => {
    if (!project) return;
    setError(null);
    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: newFilename.trim() || "note.md",
        content: newFileContent,
      }),
    });
    const data = (await res.json()) as {
      file?: ProjectFileItem;
      error?: string;
    };
    if (!res.ok || !data.file) {
      setError(data.error || "ナレッジの追加に失敗しました。");
      return;
    }
    setFiles((prev) => [data.file!, ...prev]);
    setNewFilename("");
    setNewFileContent("");
    setShowAddText(false);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}/files/${fileId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const handleDeleteProject = async () => {
    if (!project || !onDeleted) return;
    if (!confirm(`プロジェクト「${project.name}」を削除しますか？（チャット履歴は保持されます）`)) {
      return;
    }
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(project.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[#35322e] bg-[#22201e] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#302d29]">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="w-5 h-5 text-[#d97757]" />
            <h2 className="text-base font-semibold text-[#faf9f5]">
              {project ? `プロジェクト設定: ${project.name}` : "新規プロジェクト作成"}
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <form id="project-form" onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                プロジェクト名
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 新規Webアプリ開発、マーケティング企画"
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                説明（任意）
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="このプロジェクトの用途や背景"
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b7b3aa] mb-1.5">
                プロジェクト固有のカスタム指示（システムプロンプト）
              </label>
              <textarea
                rows={4}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="このプロジェクト内のすべてのチャットに適用される前提条件・ルール・トーンなど"
                className="w-full rounded-lg bg-[#191817] border border-[#35322e] px-3 py-2 text-sm text-[#eceae4] focus:outline-none focus:border-[#d97757]"
              />
            </div>
          </form>

          {project ? (
            <div
              className={`pt-4 border-t border-[#302d29] space-y-3 rounded-xl transition-colors ${
                isDraggingOver ? "bg-[#d97757]/10 ring-2 ring-[#d97757] p-3" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (e.dataTransfer.types.includes("Files")) {
                  setIsDraggingOver(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDraggingOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                if (e.dataTransfer.files?.length) {
                  void processKnowledgeFiles(e.dataTransfer.files);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-[#faf9f5]">
                    プロジェクトナレッジ（コンテキストファイル）
                  </h3>
                  <p className="text-xs text-[#9e998e]">
                    登録したファイルの内容はこのプロジェクト内のチャットに自動注入されます。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddText((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#35322e] bg-[#191817] hover:bg-[#2a2825] px-2.5 py-1.5 text-xs text-[#eceae4] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>テキスト追加</span>
                  </button>
                  <label className="inline-flex items-center gap-1 rounded-lg bg-[#d97757]/15 border border-[#d97757]/40 hover:bg-[#d97757]/25 px-2.5 py-1.5 text-xs text-[#f3c6b6] cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>ファイル選択</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,application/pdf,.txt,.md,.csv,.tsv,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.yaml,.yml,.xml,.html,.css,.sql,.sh,.tex,.bib"
                      onChange={handleUploadFiles}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {showAddText && (
                <div className="rounded-xl border border-[#35322e] bg-[#191817] p-3 space-y-2.5">
                  <input
                    type="text"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                    placeholder="ファイル名（例: spec.md）"
                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <textarea
                    rows={4}
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    placeholder="ナレッジとして保存するテキストを貼り付け..."
                    className="w-full rounded-lg bg-[#22201e] border border-[#35322e] px-3 py-1.5 text-xs text-[#eceae4] focus:outline-none focus:border-[#d97757]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddText(false)}
                      className="px-3 py-1 text-xs text-[#9e998e] hover:text-[#eceae4] cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTextKnowledge}
                      className="rounded-lg bg-[#d97757] hover:bg-[#c86747] px-3 py-1 text-xs font-medium text-white cursor-pointer"
                    >
                      追加する
                    </button>
                  </div>
                </div>
              )}

              {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#35322e] py-6 text-center text-xs text-[#858077]">
                  まだナレッジファイルがありません
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-xl border border-[#302d29] bg-[#191817] px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-[#d97757] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#eceae4] truncate">
                            {f.filename}
                          </div>
                          <div className="text-[11px] text-[#858077]">
                            {(f.size_bytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(f.id)}
                        className="p-1.5 text-[#858077] hover:text-red-400 cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#858077]">
              ※ナレッジファイルはプロジェクト作成後に追加できます。
            </p>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#302d29] bg-[#1e1c1a]">
          <div>
            {project && onDeleted && (
              <button
                type="button"
                onClick={handleDeleteProject}
                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>プロジェクトを削除</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#35322e] px-4 py-2 text-xs text-[#b7b3aa] hover:text-[#eceae4] cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="submit"
              form="project-form"
              disabled={saving}
              className="rounded-lg bg-[#d97757] hover:bg-[#c86747] disabled:opacity-50 px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
