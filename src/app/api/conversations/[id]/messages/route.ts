import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildSystemPrompt, streamClaudeResponse } from "@/lib/claude-runner";
import {
  ClaudeConnectionRow,
  COL,
  ConversationRow,
  getEffectiveMonthlyTokens,
  MessageAttachment,
  MessageRow,
  nowIso,
  ProjectFileRow,
  ProjectRow,
  recordTokenUsage,
  TeamRow,
} from "@/lib/db";
import { getFirestoreDb } from "@/lib/firebase";

async function resolveConnection(
  conversationConnId: string | null,
  userDefaultConnId: string | null,
  userTeamId: string | null
): Promise<ClaudeConnectionRow | null> {
  const db = getFirestoreDb();
  const candidateIds = [conversationConnId, userDefaultConnId].filter(
    Boolean
  ) as string[];

  const isAllowed = (c: ClaudeConnectionRow) =>
    c.is_active &&
    (c.scope === "global" ||
      (c.scope === "team" && userTeamId !== null && c.team_id === userTeamId));

  for (const cid of candidateIds) {
    const snap = await db.collection(COL.CONNECTIONS).doc(cid).get();
    if (snap.exists) {
      const c = snap.data() as ClaudeConnectionRow;
      if (isAllowed(c)) return c;
    }
  }

  const allActiveSnap = await db
    .collection(COL.CONNECTIONS)
    .where("is_active", "==", true)
    .get();

  const allowed = allActiveSnap.docs
    .map((d) => d.data() as ClaudeConnectionRow)
    .filter(isAllowed)
    .sort((a, b) => {
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
  const db = getFirestoreDb();
  const convRef = db.collection(COL.CONVERSATIONS).doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = convSnap.data() as ConversationRow;
  if (conversation.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // User monthly token limit check
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

  // Team monthly token limit check
  if (user.team_id) {
    const teamSnap = await db.collection(COL.TEAMS).doc(user.team_id).get();
    if (teamSnap.exists) {
      const team = teamSnap.data() as TeamRow;
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
  };

  const content = (body.content ?? "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!content && attachments.length === 0) {
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
  const userMsgId = crypto.randomUUID();
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
  await db.collection(COL.MESSAGES).doc(userMsgId).set(userMsgDoc);

  let updatedTitle = conversation.title;
  if (conversation.title === "新しいチャット" && content) {
    updatedTitle = content.replace(/\s+/g, " ").slice(0, 36);
  }

  await convRef.update({
    title: updatedTitle,
    model,
    connection_id: connection.id,
    updated_at: now,
  });

  let project: ProjectRow | null = null;
  let projectFiles: ProjectFileRow[] = [];
  if (conversation.project_id) {
    const projSnap = await db
      .collection(COL.PROJECTS)
      .doc(conversation.project_id)
      .get();
    if (projSnap.exists) {
      const p = projSnap.data() as ProjectRow;
      if (p.user_id === user.id) {
        project = p;
        const filesSnap = await db
          .collection(COL.PROJECT_FILES)
          .where("project_id", "==", project.id)
          .where("user_id", "==", user.id)
          .orderBy("created_at", "desc")
          .get();
        projectFiles = filesSnap.docs
          .map((d) => d.data() as ProjectFileRow)
          .reverse();
      }
    }
  }

  const historySnap = await db
    .collection(COL.MESSAGES)
    .where("conversation_id", "==", id)
    .orderBy("created_at", "asc")
    .get();
  const history = historySnap.docs.map((d) => d.data() as MessageRow);

  const systemPrompt = buildSystemPrompt({
    user,
    project,
    projectFiles,
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

      await streamClaudeResponse({
        connection,
        model,
        systemPrompt,
        history,
        signal: req.signal,
        callbacks: {
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
              attachments_json: null,
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              model,
              connection_type: connection.type,
              created_at: finishedAt,
            };

            void Promise.all([
              db.collection(COL.MESSAGES).doc(assistantId).set(assistantDoc),
              convRef.update({ updated_at: finishedAt }),
              recordTokenUsage({
                userId: user.id,
                teamId: user.team_id,
                tokens: usage.inputTokens + usage.outputTokens,
              }),
            ])
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
