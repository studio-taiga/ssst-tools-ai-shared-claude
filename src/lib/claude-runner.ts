import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptText } from "./crypto";
import {
  ClaudeConnectionRow,
  MessageAttachment,
  MessageRow,
  ProjectFileRow,
  ProjectRow,
  UserRow,
} from "./db";
import { resolveCliModel } from "./models";

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onComplete: (usage: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

export function buildSystemPrompt(params: {
  user: UserRow;
  project: ProjectRow | null;
  projectFiles: ProjectFileRow[];
}): string {
  const sections: string[] = [];

  if (params.user.custom_instructions.trim()) {
    sections.push(
      `<user_custom_instructions account="${params.user.display_name}">\n${params.user.custom_instructions.trim()}\n</user_custom_instructions>`
    );
  }

  if (params.project) {
    if (params.project.system_prompt.trim()) {
      sections.push(
        `<project_instructions project="${params.project.name}">\n${params.project.system_prompt.trim()}\n</project_instructions>`
      );
    }

    if (params.projectFiles.length > 0) {
      const filesText = params.projectFiles
        .map(
          (f) =>
            `<file name="${f.filename}">\n${f.content}\n</file>`
        )
        .join("\n\n");
      sections.push(
        `<project_knowledge project="${params.project.name}">\n以下はこのプロジェクトに紐づく参照ナレッジです。回答時に適宜参照してください。\n\n${filesText}\n</project_knowledge>`
      );
    }
  }

  return sections.join("\n\n");
}

function parseAttachments(raw: string | null): MessageAttachment[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MessageAttachment[];
  } catch {
    return [];
  }
}

function buildAnthropicMessages(
  history: MessageRow[]
): Anthropic.MessageParam[] {
  return history.map((msg) => {
    const attachments = parseAttachments(msg.attachments_json);
    if (msg.role === "assistant" || attachments.length === 0) {
      return {
        role: msg.role,
        content: msg.content,
      };
    }

    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const att of attachments) {
      if (att.kind === "image") {
        const allowedMime = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ] as const;
        type AllowedMime = (typeof allowedMime)[number];
        const mediaType: AllowedMime = allowedMime.includes(
          att.mimeType as AllowedMime
        )
          ? (att.mimeType as AllowedMime)
          : "image/png";
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: att.data,
          },
        });
      } else {
        blocks.push({
          type: "text",
          text: `<attached_file name="${att.name}">\n${att.data}\n</attached_file>`,
        });
      }
    }

    if (msg.content.trim()) {
      blocks.push({ type: "text", text: msg.content });
    }

    return {
      role: "user",
      content: blocks,
    };
  });
}

function buildCliPrompt(history: MessageRow[], inlineSystemPrompt?: string): string {
  const parts: string[] = [];
  if (inlineSystemPrompt && inlineSystemPrompt.trim()) {
    parts.push(`<system_context>\n${inlineSystemPrompt.trim()}\n</system_context>`);
  }

  if (history.length === 1) {
    const only = history[0];
    const attachments = parseAttachments(only.attachments_json);
    const textAtts = attachments
      .filter((a) => a.kind === "text")
      .map((a) => `<attached_file name="${a.name}">\n${a.data}\n</attached_file>`)
      .join("\n\n");
    parts.push([textAtts, only.content].filter(Boolean).join("\n\n"));
    return parts.join("\n\n");
  }

  const prior = history.slice(0, -1);
  const latest = history[history.length - 1];

  const historyText = prior
    .map((m) => {
      const tag = m.role === "user" ? "User" : "Assistant";
      const attachments = parseAttachments(m.attachments_json);
      const textAtts = attachments
        .filter((a) => a.kind === "text")
        .map((a) => `[添付ファイル: ${a.name}]\n${a.data}`)
        .join("\n");
      const body = [textAtts, m.content].filter(Boolean).join("\n\n");
      return `[${tag}]\n${body}`;
    })
    .join("\n\n---\n\n");

  parts.push(
    `<conversation_history>\n${historyText}\n</conversation_history>`
  );

  const latestAttachments = parseAttachments(latest.attachments_json);
  const latestTextAtts = latestAttachments
    .filter((a) => a.kind === "text")
    .map((a) => `<attached_file name="${a.name}">\n${a.data}\n</attached_file>`)
    .join("\n\n");

  parts.push(
    `以下の最新のユーザーメッセージに続けて回答してください。\n\n${[
      latestTextAtts,
      latest.content,
    ]
      .filter(Boolean)
      .join("\n\n")}`
  );

  return parts.join("\n\n");
}

async function runAnthropicApi(params: {
  connection: ClaudeConnectionRow;
  model: string;
  systemPrompt: string;
  history: MessageRow[];
  callbacks: StreamCallbacks;
  signal?: AbortSignal;
}): Promise<void> {
  const apiKey = params.connection.api_key_encrypted
    ? await decryptText(params.connection.api_key_encrypted)
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Anthropic APIキーが設定されていません。管理画面の接続設定または環境変数 ANTHROPIC_API_KEY を確認してください。"
    );
  }

  const baseURL = params.connection.base_url?.trim() || undefined;
  const client = new Anthropic({ apiKey, baseURL });
  const messages = buildAnthropicMessages(params.history);

  const maxTokens =
    params.connection.max_tokens && params.connection.max_tokens > 0
      ? params.connection.max_tokens
      : 8192;

  const stream = client.messages.stream(
    {
      model: params.model,
      max_tokens: maxTokens,
      system: params.systemPrompt || undefined,
      messages,
    },
    { signal: params.signal }
  );

  stream.on("text", (textDelta) => {
    params.callbacks.onDelta(textDelta);
  });

  const finalMessage = await stream.finalMessage();
  params.callbacks.onComplete({
    inputTokens: finalMessage.usage?.input_tokens ?? 0,
    outputTokens: finalMessage.usage?.output_tokens ?? 0,
  });
}

export function resolveClaudeBinary(): string {
  const localBin = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "claude.cmd" : "claude"
  );
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return "claude";
}

async function runClaudeCli(params: {
  connection: ClaudeConnectionRow;
  model: string;
  systemPrompt: string;
  history: MessageRow[];
  callbacks: StreamCallbacks;
  signal?: AbortSignal;
}): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // サブスクリプション（OAuth）認証を優先させるため APIキー環境変数を除去
  delete env.ANTHROPIC_API_KEY;

  if (params.connection.oauth_token_encrypted) {
    const token = await decryptText(params.connection.oauth_token_encrypted);
    if (token) {
      env.CLAUDE_CODE_OAUTH_TOKEN = token;
    }
  }
  if (params.connection.base_url?.trim()) {
    env.ANTHROPIC_BASE_URL = params.connection.base_url.trim();
  }

  if (params.connection.cli_config_dir?.trim()) {
    env.CLAUDE_CONFIG_DIR = params.connection.cli_config_dir.trim();
  } else if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    // サーバーレス環境でも書き込み可能な /tmp 配下を設定ディレクトリに使う
    const tmpConfig = path.join(os.tmpdir(), "shared-claude-cli");
    if (!fs.existsSync(tmpConfig)) {
      fs.mkdirSync(tmpConfig, { recursive: true });
    }
    env.CLAUDE_CONFIG_DIR = tmpConfig;
  }

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools",
    "",
    "--no-session-persistence",
    "--model",
    resolveCliModel(params.model),
  ];

  // システムプロンプトが大きすぎる場合は stdin 側に含める
  let inlineSystem: string | undefined;
  if (params.systemPrompt.trim()) {
    if (Buffer.byteLength(params.systemPrompt, "utf8") < 24 * 1024) {
      args.push("--system-prompt", params.systemPrompt);
    } else {
      inlineSystem = params.systemPrompt;
    }
  }

  const promptInput = buildCliPrompt(params.history, inlineSystem);
  const claudeBin = resolveClaudeBinary();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrBuf = "";
    let stdoutBuf = "";
    let streamedChars = 0;
    let finished = false;
    let inputTokens = 0;
    let outputTokens = 0;

    const abortHandler = () => {
      child.kill("SIGTERM");
    };
    params.signal?.addEventListener("abort", abortHandler, { once: true });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (finished) return;
      finished = true;
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "サーバーに `claude` CLI が見つかりません。プラン契約共有を使うには Claude Code CLI をインストールし、`claude login` でログインしてください。"
          )
        );
      } else {
        reject(err);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            type?: string;
            subtype?: string;
            is_error?: boolean;
            result?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
            event?: {
              type?: string;
              delta?: { type?: string; text?: string };
            };
          };

          if (
            parsed.type === "stream_event" &&
            parsed.event?.type === "content_block_delta" &&
            parsed.event?.delta?.type === "text_delta" &&
            typeof parsed.event.delta.text === "string"
          ) {
            streamedChars += parsed.event.delta.text.length;
            params.callbacks.onDelta(parsed.event.delta.text);
          } else if (parsed.type === "result") {
            if (parsed.is_error) {
              const msg = parsed.result || "Claude CLI からエラーが返されました。";
              if (!finished) {
                finished = true;
                reject(new Error(msg));
              }
              return;
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.input_tokens ?? 0;
              outputTokens = parsed.usage.output_tokens ?? 0;
            }
            if (streamedChars === 0 && typeof parsed.result === "string" && parsed.result) {
              streamedChars += parsed.result.length;
              params.callbacks.onDelta(parsed.result);
            }
          }
        } catch {
          // Ignore non-JSON lines if any
        }
      }
    });

    child.on("close", (code) => {
      params.signal?.removeEventListener("abort", abortHandler);
      if (finished) return;
      finished = true;

      if (code !== 0) {
        const detail = stderrBuf.trim() || `終了コード ${code}`;
        if (detail.toLowerCase().includes("login") || detail.toLowerCase().includes("auth")) {
          reject(
            new Error(
              `Claude CLI の認証エラーです。サーバー上で \`claude login\` を実行してください。（詳細: ${detail}）`
            )
          );
        } else {
          reject(new Error(`Claude CLI 実行エラー: ${detail}`));
        }
        return;
      }

      params.callbacks.onComplete({ inputTokens, outputTokens });
      resolve();
    });

    child.stdin.write(promptInput);
    child.stdin.end();
  });
}

export async function streamClaudeResponse(params: {
  connection: ClaudeConnectionRow;
  model: string;
  systemPrompt: string;
  history: MessageRow[];
  callbacks: StreamCallbacks;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    if (params.connection.type === "anthropic_api") {
      await runAnthropicApi(params);
    } else {
      await runClaudeCli(params);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    params.callbacks.onError(error);
  }
}
