import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildSystemPrompt, streamClaudeResponse } from "@/lib/claude-runner";
import { decryptText } from "@/lib/crypto";
import {
  ClaudeConnectionRow,
  getEffectiveMonthlyTokens,
  MessageAttachment,
  MessageRow,
  nowIso,
  ProjectFileRow,
  ProjectRow,
} from "@/lib/db";
import { fetchConnectionModels, ModelPricing } from "@/lib/pricing";
import { getStore } from "@/lib/store";

async function resolveConnection(
  conversationConnId: string | null,
  userDefaultConnId: string | null,
  userTeamId: string | null
): Promise<ClaudeConnectionRow | null> {
  const store = getStore();
  const candidateIds = [conversationConnId, userDefaultConnId].filter(
    Boolean
  ) as string[];

  const isAllowed = (c: ClaudeConnectionRow) =>
    c.is_active &&
    (c.scope === "global" ||
      (c.scope === "team" && userTeamId !== null && c.team_id === userTeamId));

  for (const cid of candidateIds) {
    const c = await store.getConnection(cid);
    if (c && isAllowed(c)) return c;
  }

  const allActive = await store.listConnections(true);
  const allowed = allActive.filter(isAllowed).sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  return allowed[0] ?? null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const store = getStore();
  const conversation = await store.getConversation(id);
  if (!conversation || conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.monthly_token_limit !== null) {
    const used = getEffectiveMonthlyTokens(user);
    if (used >= user.monthly_token_limit) {
      return NextResponse.json(
        {
          error: `今月のトークン上限 (${user.monthly_token_limit.toLocaleString()}) に達しました。管理者に上限引き上げを依頼してください。`,
        },
        { status: 429 }
      );
    }
  }

  if (user.team_id) {
    const team = await store.getTeam(user.team_id);
    if (team) {
      if (!team.is_active) {
        return NextResponse.json(
          { error: "所属チームが無効化されています。" },
          { status: 403 }
        );
      }
      if (
        team.monthly_token_limit !== null &&
        getEffectiveMonthlyTokens(team) >= team.monthly_token_limit
      ) {
        return NextResponse.json(
          {
            error: `所属チームの月間トークン上限 (${team.monthly_token_limit.toLocaleString()}) に達しました。`,
          },
          { status: 429 }
        );
      }
    }
  }

  const body = (await req.json()) as {
    content?: string;
    attachments?: MessageAttachment[];
    model?: string;
    connectionId?: string | null;
    enableThinking?: boolean;
    enableWebSearch?: boolean;
    enableArtifacts?: boolean;
    responseStyle?: string;
    truncateFromMessageId?: string;
    regenerateOnly?: boolean;
  };

  const content = (body.content ?? "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!body.regenerateOnly && !content && attachments.length === 0) {
    return NextResponse.json(
      { error: "メッセージを入力してください。" },
      { status: 400 }
    );
  }

  const model = (body.model ?? "").trim() || conversation.model;
  const requestedConnId =
    body.connectionId !== undefined
      ? body.connectionId
      : conversation.connection_id;

  const connection = await resolveConnection(
    requestedConnId,
    user.default_connection_id,
    user.team_id
  );
  if (!connection) {
    return NextResponse.json(
      {
        error:
          "有効な Claude 接続（APIキー等）が登録されていません。管理パネルから接続を追加してください。",
      },
      { status: 400 }
    );
  }

  const now = nowIso();

  if (body.truncateFromMessageId) {
    await store.deleteMessagesFrom(id, body.truncateFromMessageId);
  }

  let userMsgId = body.truncateFromMessageId || crypto.randomUUID();
  if (!body.regenerateOnly) {
    userMsgId = crypto.randomUUID();
    const attachmentsJson =
      attachments.length > 0 ? JSON.stringify(attachments) : null;

    const userMsgDoc: MessageRow = {
      id: userMsgId,
      conversation_id: id,
      user_id: user.id,
      role: "user",
      content,
      attachments_json: attachmentsJson,
      input_tokens: 0,
      output_tokens: 0,
      model: null,
      connection_type: null,
      created_at: now,
    };
    await store.createMessage(userMsgDoc);
  }

  let updatedTitle = conversation.title;
  if (conversation.title === "新しいチャット" && content) {
    updatedTitle = content.replace(/\s+/g, " ").slice(0, 36);
  }

  await store.updateConversation(id, {
    title: updatedTitle,
    model,
    connection_id: connection.id,
    updated_at: now,
  });

  let project: ProjectRow | null = null;
  let projectFiles: ProjectFileRow[] = [];
  if (conversation.project_id) {
    const p = await store.getProject(conversation.project_id);
    if (p && p.user_id === user.id) {
      project = p;
      projectFiles = (await store.listProjectFiles(project.id, user.id)).reverse();
    }
  }

  const history = await store.listMessages(id);

  const systemPrompt = buildSystemPrompt({
    user,
    project,
    projectFiles,
    responseStyle: body.responseStyle,
    enableArtifacts: body.enableArtifacts,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      sendEvent("meta", {
        userMessageId: userMsgId,
        conversationTitle: updatedTitle,
        connectionName: connection.name,
        connectionType: connection.type,
        model,
      });

      let fullText = "";
      let fullThinking = "";

      await streamClaudeResponse({
        connection,
        model,
        systemPrompt,
        history,
        enableThinking: body.enableThinking,
        enableWebSearch: body.enableWebSearch,
        signal: req.signal,
        callbacks: {
          onThinkingDelta(text) {
            fullThinking += text;
            sendEvent("thinking", { text });
          },
          onDelta(text) {
            fullText += text;
            sendEvent("delta", { text });
          },
          onComplete(usage) {
            const assistantId = crypto.randomUUID();
            const finishedAt = nowIso();
            const assistantDoc: MessageRow = {
              id: assistantId,
              conversation_id: id,
              user_id: user.id,
              role: "assistant",
              content: fullText,
              thinking_content: fullThinking || null,
              attachments_json: null,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              model,
              connection_type: connection.type,
              created_at: finishedAt,
            };

            const resolvePricing = async (): Promise<
              ModelPricing | undefined
            > => {
              if (connection.type !== "anthropic_api" || !connection.base_url) {
                return undefined;
              }
              try {
                const key = connection.api_key_encrypted
                  ? await decryptText(connection.api_key_encrypted)
                  : process.env.ANTHROPIC_API_KEY;
                if (!key) return undefined;
                const list = await fetchConnectionModels({
                  connectionId: connection.id,
                  apiKey: key,
                  baseUrl: connection.base_url,
                });
                return list.find((m) => m.id === model)?.pricing;
              } catch {
                return undefined;
              }
            };

            void resolvePricing()
              .then((pricingOverride) =>
                Promise.all([
                  store.createMessage(assistantDoc),
                  store.updateConversation(id, { updated_at: finishedAt }),
                  store.recordTokenUsage({
                    userId: user.id,
                    teamId: user.team_id,
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    model,
                    connectionType: connection.type,
                    pricingOverride,
                  }),
                ])
              )
              .then(() => {
                sendEvent("done", {
                  assistantMessageId: assistantId,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                });
                controller.close();
              })
              .catch((err) => {
                sendEvent("error", {
                  error: err instanceof Error ? err.message : String(err),
                });
                controller.close();
              });
          },
          onError(error) {
            sendEvent("error", { error: error.message });
            controller.close();
          },
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
