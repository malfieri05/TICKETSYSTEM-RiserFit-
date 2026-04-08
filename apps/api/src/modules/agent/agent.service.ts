import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';
import { ToolRouterService } from './tool-router.service';
import {
  AGENT_TOOLS,
  MUTATION_TOOLS,
  CONFIRM_STATUS_TRANSITIONS,
} from './tool-definitions';
import { RequestUser } from '../auth/strategies/jwt.strategy';

const CHAT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY = 20; // messages to include in context
const MAX_OUTPUT_TOKENS = 1200;
const DAILY_QUOTA = 100; // messages per user per day

interface ActionPlanAction {
  tool: string;
  args: Record<string, unknown>;
}

interface ActionPlan {
  summary: string;
  actions: ActionPlanAction[];
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AgentResponse {
  conversationId: string;
  messageId: string;
  mode: 'ASK' | 'DO';
  content: string;
  actionPlan?: ActionPlan & { requires_confirmation: true };
  toolResults?: Array<{ tool: string; result: unknown }>;
  sources?: Array<{
    documentId: string;
    title: string;
    text: string;
    pagesLabel?: string;
  }>;
}

/**
 * Events emitted by `AgentService.chatStream`. The streaming controller
 * serializes each event as an SSE `data:` frame so the chat UI can render
 * tokens as they're produced. Every stream ends with exactly one `done` or
 * `error` event.
 */
export type AgentStreamEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'thinking'; phase: 'tools' | 'compose' }
  | { type: 'delta'; delta: string }
  | { type: 'done'; payload: AgentResponse }
  | { type: 'error'; message: string };

/** OpenAI tool call with function payload (narrows union for type safety). */
type ToolCallWithFunction = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

/** One citation per knowledge document, merged page list in retrieval order. */
function aggregateKnowledgeSources(
  chunks: Array<{
    documentId: string;
    title: string;
    text: string;
    pageNumber: number | null;
  }>,
): Array<{
  documentId: string;
  title: string;
  text: string;
  pagesLabel?: string;
}> {
  const order: string[] = [];
  const byDoc = new Map<
    string,
    { title: string; text: string; pages: Set<number> }
  >();

  for (const c of chunks) {
    if (!byDoc.has(c.documentId)) {
      order.push(c.documentId);
      byDoc.set(c.documentId, {
        title: c.title,
        text: c.text,
        pages: new Set(),
      });
    }
    const row = byDoc.get(c.documentId)!;
    if (c.pageNumber != null && c.pageNumber > 0) {
      row.pages.add(Math.floor(c.pageNumber));
    }
  }

  return order.map((id) => {
    const r = byDoc.get(id)!;
    const sorted = [...r.pages].sort((a, b) => a - b);
    return {
      documentId: id,
      title: r.title,
      text: r.text,
      ...(sorted.length > 0
        ? { pagesLabel: `Pages ${sorted.join(', ')}` }
        : {}),
    };
  });
}

const SYSTEM_PROMPT = `You are Rovi, the AI assistant for an internal ticketing system used by ~500 employees.

MODES:
- ASK: Answer questions about tickets, users, studios, markets, metrics, company knowledge, and how to use this application (navigation, screens, roles).
- DO: Create/update tickets, assign, comment, manage subtasks. Always use tools for actions — NEVER pretend you changed something without a tool call.

CONFIRMATION FLOW (CRITICAL):
- When the user asks you to perform an action (create ticket, change status, assign, etc.), you MUST:
  1) Decide which tools to call and with what arguments.
  2) Include those tool calls in your response.
  3) Provide a short natural-language summary of what you plan to do.
- You MUST NOT ask the user to type "yes", "confirm", or similar in free text.
- The UI will show Confirm/Cancel buttons automatically. Do NOT add phrases like "Click Confirm to proceed" or "Click Cancel to stop" in your summary — the buttons are self-explanatory.

PRODUCT Q&A (how to use Rovi) — NON-NEGOTIABLE:
- For ANY question of the form "how do I …", "where is …", "where do I …", "what is …", "what does … do", "can I …", or "how does Rovi handle …": you MUST call knowledge_search FIRST, before composing an answer.
- Do NOT guess navigation paths. Do NOT invent screens or URLs. Only quote paths that appear in the retrieved chunks.
- Do NOT default to "ask your manager", "contact IT", or "submit a ticket" before you have called knowledge_search. Those are fallbacks for AFTER retrieval returns nothing useful, not a substitute for searching.
- If retrieval returns nothing relevant: say plainly "the help docs don't cover that yet" and suggest asking an admin or filing a request to the team that owns the feature. Never fabricate a workaround.
- ALWAYS cite the source article title in your answer for product Q&A (e.g. "from Rovi Help — Workflow templates (admin)").

GROUNDING:
- When you have retrieved chunks, every concrete step or path in your answer must come from them. If a step isn't in the retrieved context, don't include it.
- Prefer steps and paths from "Rovi Help — …" articles over any other source for product Q&A.

ROLE AWARENESS:
- Whenever the correct answer depends on the user's role (studio vs department vs admin) — especially for admin-only screens like /admin/workflow-templates, /admin/dispatch, /admin/reporting, /admin/lease-iq, /admin/email-automation, /admin/system-monitoring, /admin/knowledge-base, /admin/markets, /admin/users, and /inbox — call get_current_user_context FIRST, then tailor the steps. Never tell a user to open an admin URL if their role is not ADMIN; instead, say "that screen is admin only" and point them at something they can use.

RULES:
1. Use tools to get data before answering questions. Don't guess.
2. For actions: always include the appropriate tool calls. Let the UI handle confirmation.
3. Be concise. Use bullet points. No fluff.
4. When citing knowledge base results, mention the source title.
5. If you can't do something due to permissions, explain why.
6. Never fabricate ticket IDs, user IDs, data, paths, or features.
7. If asked about something not in your scope, say so. Never suggest submitting a ticket.

TOOL USAGE:
- "How many [urgent/high/medium/low] tickets?" → ALWAYS use get_ticket_metrics with group_by: "priority". Optionally pass priority: ["URGENT"] (or HIGH, etc.) to filter. Then answer with the number(s) from the returned counts.
- "How many tickets by status/category/market?" → use get_ticket_metrics with the right group_by.
- "How many live / open maintenance tickets today?" → get_ticket_metrics with ticket_class: "MAINTENANCE", open_only: true, date_preset: "today", group_by: "status" (or "studio" for a breakdown). Counts only include tickets the user is allowed to see.
- "Which studio has the most maintenance issues (historically)?" → get_ticket_metrics with group_by: "studio", ticket_class: "MAINTENANCE", limit: 10 (omit date_preset for all time, or use last_30_days / last_7_days for a window).
- "Most new hires / new users by studio?" → use query_user_rollups with group_by: "studio" and the right date_preset or created_after/created_before. Tell the user these are account signups (User.createdAt), not HR hire dates, if the tool disclaimer applies.
- To look up specific tickets: use search_tickets or get_ticket.
- Handbook, policy, retail tips, HR, procedures, or "what does the company say about…": use knowledge_search first.
- Product Q&A — how to use Rovi (creating a maintenance ticket, workflow templates, vendor dispatch, reporting, inbox, portal vs /tickets, Assistant vs Handbook, Lease IQ, email automation, attachments, SLAs, notifications): use knowledge_search FIRST. Ground every step in the retrieved Rovi Help chunks and include the literal paths they quote (e.g. /tickets/new, /admin/dispatch, /admin/workflow-templates).
- Create/modify tickets: use the appropriate mutation tool.
- Find categories or assignees: use list_categories or list_users.

FORMAT:
- Keep responses under 300 words unless the user explicitly asks for detail.
- Use plain text only in the chat UI: do NOT use markdown (no **bold**, no # headings, no \`code\` fences). Use simple line breaks; use hyphen bullets like "- Item" without asterisks around words.
- When you mention an in-app URL, write it as a plain path starting with / so the UI can link it (example: open /admin/workflow-templates).`;

/**
 * Sent as a SEPARATE system message AFTER the tool result messages on the
 * post-tool follow-up call. Kept out of `SYSTEM_PROMPT` deliberately so the
 * follow-up call's leading `{ role: 'system', content: SYSTEM_PROMPT }` is
 * BYTE-IDENTICAL to the first call's leading system message — that's what
 * OpenAI's automatic prompt caching needs to keep the long system prompt in
 * cache across the two halves of a single agent turn (and across turns).
 */
const TOOL_FOLLOW_UP_DIRECTIVE = `TOOL RESULTS (this turn only): Tool outputs are already in the messages above — the lookups are finished.
- Answer with the actual data from those JSON results: ticket titles, statuses, counts, names, or knowledge excerpts.
- Do not say you will retrieve, check, or look something up "now". Do not stop after a plan — summarize what the tools returned.
- If every tool result contains an "error" field, explain the failure plainly.
- If search_tickets returned zero tickets or an empty list, say no matching tickets were found for this user's visibility.
- Plain text only; keep it under 300 words.`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private _openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly toolRouter: ToolRouterService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      this._openai = new OpenAI({ apiKey: key });
    }
  }

  private get openai(): OpenAI {
    if (!this._openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    return this._openai;
  }

  // ── Main chat entry point ─────────────────────────────────────────────────

  async chat(
    message: string,
    actor: RequestUser,
    conversationId?: string,
    allowWebSearch?: boolean,
  ): Promise<AgentResponse> {
    // Run independent pre-LLM work in parallel: quota check, conversation
    // lookup/create, and the deterministic create-ticket fast path. None of
    // these depend on each other. `checkQuota` still throws (and aborts the
    // whole Promise.all) if the user is over their daily limit.
    const [, convo, directPlan] = await Promise.all([
      this.checkQuota(actor),
      conversationId
        ? this.prisma.agentConversation.findUniqueOrThrow({
            where: { id: conversationId },
          })
        : this.prisma.agentConversation.create({
            data: { userId: actor.id },
          }),
      this.tryBuildCreateTicketPlan(message),
    ]);

    // Deterministic fast-path:
    // If the user clearly asks to create a ticket and provided enough details,
    // immediately return a DO ActionPlan with Confirm/Cancel (no extra prompting).
    if (directPlan) {
      // Persist the user message first (the deterministic plan path skips the
      // OpenAI call entirely, so there's no parallelization opportunity here).
      await this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: directPlan.summary,
          mode: 'DO',
          actionPlan: JSON.parse(JSON.stringify(directPlan)),
        },
      });

      return {
        conversationId: convo.id,
        messageId: saved.id,
        mode: 'DO',
        content: directPlan.summary,
        actionPlan: { ...directPlan, requires_confirmation: true },
      };
    }

    // If OpenAI is not configured, return a graceful message instead of throwing.
    if (!this._openai) {
      const fallbackContent =
        'The AI Agent is not fully configured yet (missing OPENAI_API_KEY on the API server), ' +
        'so I cannot run automated actions or advanced Q&A right now.\n\n' +
        'You can still manage tickets directly in the UI. Once the API key is added, the agent will be able to search, summarize, and take actions for you.';

      await this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: fallbackContent,
          mode: 'ASK',
        },
      });

      return {
        conversationId: convo.id,
        messageId: saved.id,
        mode: 'ASK',
        content: fallbackContent,
      };
    }

    // Load PRIOR history (without the user message we're about to send) so we
    // can persist that user message in parallel with the OpenAI call below.
    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true, toolCalls: true, toolResults: true },
    });

    // Build messages for OpenAI. Append the new user message manually since
    // we haven't persisted it yet (it lands in DB in parallel with the call).
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.buildHistoryMessages(history),
      { role: 'user' as const, content: message },
    ];

    // Persist the user message and call OpenAI in parallel — neither needs
    // to wait on the other. The user-message INSERT typically completes well
    // before OpenAI returns, but parallelizing shaves the round-trip time
    // off the user-perceived latency.
    const [, completion] = await Promise.all([
      this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      }),
      // Call OpenAI with tool definitions — force tool usage so the model
      // never responds with just text when it should be calling tools.
      this.openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools: AGENT_TOOLS as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: 'required',
        temperature: 0.1,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    ]);

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) throw new Error('No response from model');

    // Fallback: if somehow still no tool calls
    if (!assistantMessage.tool_calls?.length) {
      const text = this.resolveModelReply(assistantMessage.content, []);
      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: text,
          mode: 'ASK',
          tokenCount: completion.usage?.total_tokens,
        },
      });

      return {
        conversationId: convo.id,
        messageId: saved.id,
        mode: 'ASK',
        content: text,
      };
    }

    // Has tool calls — determine if we need confirmation
    const toolCalls = assistantMessage.tool_calls;
    const needsConfirmation = this.requiresConfirmation(toolCalls, actor);

    if (needsConfirmation) {
      // Build an action plan and return it for confirmation
      const rawSummary =
        assistantMessage.content ?? 'The following actions will be performed:';
      const plan: ActionPlan = {
        summary: this.stripConfirmCancelPhrase(rawSummary),
        actions: (toolCalls as ToolCallWithFunction[]).map((tc) => ({
          tool: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        })),
        risk_level: this.assessRisk(toolCalls),
      };

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: plan.summary,
          mode: 'DO',
          toolCalls: JSON.parse(JSON.stringify(toolCalls)),
          actionPlan: JSON.parse(JSON.stringify(plan)),
          tokenCount: completion.usage?.total_tokens,
        },
      });

      return {
        conversationId: convo.id,
        messageId: saved.id,
        mode: 'DO',
        content: plan.summary,
        actionPlan: { ...plan, requires_confirmation: true },
      };
    }

    // Execute tools immediately (no confirmation needed). We pass the same
    // `messages` array we just sent to OpenAI so the follow-up call can reuse
    // it without re-fetching history from Postgres.
    return this.executeToolCalls(
      convo.id,
      toolCalls,
      assistantMessage.content,
      actor,
      completion.usage?.total_tokens,
      messages,
    );
  }

  // ── Streaming chat (additive — old `chat` endpoint still works as JSON) ───

  /**
   * Streaming variant of `chat`. Mirrors the same orchestration but yields
   * `AgentStreamEvent`s so the controller can pipe them to an SSE response.
   *
   * The big UX win is that the post-tool follow-up completion (which
   * historically took 2–4 s of dead time) is streamed token-by-token, so the
   * user sees the answer appear as it's generated. Time-to-first-token drops
   * from a few seconds to a few hundred ms with **zero change in tokens
   * billed** — same model, same temperature, same max_tokens.
   *
   * For non-streaming code paths (deterministic plan, no tool calls,
   * confirmation needed), this method emits a single `done` event with the
   * same shape as `AgentResponse` so the client can handle them uniformly.
   */
  async *chatStream(
    message: string,
    actor: RequestUser,
    conversationId?: string,
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    // Same parallel pre-LLM block as `chat()`. Quota check throws on overage.
    const [, convo, directPlan] = await Promise.all([
      this.checkQuota(actor),
      conversationId
        ? this.prisma.agentConversation.findUniqueOrThrow({
            where: { id: conversationId },
          })
        : this.prisma.agentConversation.create({
            data: { userId: actor.id },
          }),
      this.tryBuildCreateTicketPlan(message),
    ]);

    yield { type: 'start', conversationId: convo.id };

    // Deterministic create-ticket fast path — no LLM call, no streaming.
    if (directPlan) {
      await this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: directPlan.summary,
          mode: 'DO',
          actionPlan: JSON.parse(JSON.stringify(directPlan)),
        },
      });

      yield {
        type: 'done',
        payload: {
          conversationId: convo.id,
          messageId: saved.id,
          mode: 'DO',
          content: directPlan.summary,
          actionPlan: { ...directPlan, requires_confirmation: true },
        },
      };
      return;
    }

    // OpenAI not configured — graceful fallback (no LLM call, no streaming).
    if (!this._openai) {
      const fallbackContent =
        'The AI Agent is not fully configured yet (missing OPENAI_API_KEY on the API server), ' +
        'so I cannot run automated actions or advanced Q&A right now.\n\n' +
        'You can still manage tickets directly in the UI. Once the API key is added, the agent will be able to search, summarize, and take actions for you.';

      await this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: fallbackContent,
          mode: 'ASK',
        },
      });

      yield {
        type: 'done',
        payload: {
          conversationId: convo.id,
          messageId: saved.id,
          mode: 'ASK',
          content: fallbackContent,
        },
      };
      return;
    }

    // Load PRIOR history (without the user message we're about to send) so we
    // can persist that user message in parallel with the OpenAI call below.
    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true, toolCalls: true, toolResults: true },
    });

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.buildHistoryMessages(history),
      { role: 'user' as const, content: message },
    ];

    // First call: forced tool use. Not streamed — it returns mostly tool calls
    // with little or no text. Persist the user message in parallel.
    const [, completion] = await Promise.all([
      this.prisma.agentMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      }),
      this.openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools: AGENT_TOOLS as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: 'required',
        temperature: 0.1,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    ]);

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) {
      yield { type: 'error', message: 'No response from model' };
      return;
    }

    // No tool calls (rare with tool_choice: 'required', but defensive).
    if (!assistantMessage.tool_calls?.length) {
      const text = this.resolveModelReply(assistantMessage.content, []);
      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: text,
          mode: 'ASK',
          tokenCount: completion.usage?.total_tokens,
        },
      });
      yield {
        type: 'done',
        payload: {
          conversationId: convo.id,
          messageId: saved.id,
          mode: 'ASK',
          content: text,
        },
      };
      return;
    }

    const toolCalls = assistantMessage.tool_calls;
    const needsConfirmation = this.requiresConfirmation(toolCalls, actor);

    // Mutating action — return action plan, no streaming.
    if (needsConfirmation) {
      const rawSummary =
        assistantMessage.content ?? 'The following actions will be performed:';
      const plan: ActionPlan = {
        summary: this.stripConfirmCancelPhrase(rawSummary),
        actions: (toolCalls as ToolCallWithFunction[]).map((tc) => ({
          tool: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        })),
        risk_level: this.assessRisk(toolCalls),
      };

      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: plan.summary,
          mode: 'DO',
          toolCalls: JSON.parse(JSON.stringify(toolCalls)),
          actionPlan: JSON.parse(JSON.stringify(plan)),
          tokenCount: completion.usage?.total_tokens,
        },
      });

      yield {
        type: 'done',
        payload: {
          conversationId: convo.id,
          messageId: saved.id,
          mode: 'DO',
          content: plan.summary,
          actionPlan: { ...plan, requires_confirmation: true },
        },
      };
      return;
    }

    // Read-only tools (search, get, knowledge_search, ...). Run them, then
    // STREAM the follow-up completion token-by-token so the UI updates live.
    yield { type: 'thinking', phase: 'tools' };

    const results: Array<{ tool: string; result: unknown }> = [];
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [];

    for (const raw of toolCalls) {
      const tc: any = raw;
      const args = JSON.parse(tc.function.arguments);
      const start = Date.now();
      const result = await this.toolRouter.execute(
        tc.function.name,
        args,
        actor,
      );

      await this.prisma.agentActionLog.create({
        data: {
          userId: actor.id,
          conversationId: convo.id,
          toolName: tc.function.name,
          toolArgs: args,
          resultSummary: result.success
            ? JSON.stringify(result.data).slice(0, 500)
            : null,
          success: result.success,
          errorMessage: result.error,
          executionMs: Date.now() - start,
        },
      });

      results.push({
        tool: tc.function.name,
        result: result.success ? result.data : { error: result.error },
      });

      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: JSON.stringify(
          result.success ? result.data : { error: result.error },
        ),
      });
    }

    yield { type: 'thinking', phase: 'compose' };

    // Streaming follow-up call. Same exact request shape as the non-streaming
    // path in `executeToolCalls` but with `stream: true`. Same model, same
    // tokens, same billing — only the transport changes.
    const followUpStream = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        ...messages,
        {
          role: 'assistant' as const,
          content: assistantMessage.content,
          tool_calls: (toolCalls as ToolCallWithFunction[]).map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        ...toolMessages,
        { role: 'system' as const, content: TOOL_FOLLOW_UP_DIRECTIVE },
      ],
      temperature: 0.1,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    });

    let composedContent = '';
    let followUpUsageTokens = 0;
    for await (const chunk of followUpStream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        composedContent += delta;
        yield { type: 'delta', delta };
      }
      // The final chunk (when include_usage is set) carries token usage.
      if (chunk.usage?.total_tokens) {
        followUpUsageTokens = chunk.usage.total_tokens;
      }
    }

    const finalContent = this.resolveModelReply(composedContent, results);
    const mode = (toolCalls as ToolCallWithFunction[]).some((tc) =>
      MUTATION_TOOLS.has(tc.function.name),
    )
      ? 'DO'
      : 'ASK';

    // Knowledge search citations (same logic as executeToolCalls).
    const knowledgeResults = results.find((r) => r.tool === 'knowledge_search');
    const rawKnowledge = (
      knowledgeResults?.result as { chunks?: unknown } | undefined
    )?.chunks;
    const rawChunks = Array.isArray(rawKnowledge)
      ? rawKnowledge.filter(
          (c): c is {
            documentId: string;
            title: string;
            text: string;
            pageNumber: number | null;
          } =>
            typeof c === 'object' &&
            c !== null &&
            typeof (c as { documentId?: unknown }).documentId === 'string' &&
            typeof (c as { title?: unknown }).title === 'string' &&
            typeof (c as { text?: unknown }).text === 'string',
        )
      : [];
    const sources =
      rawChunks.length > 0 ? aggregateKnowledgeSources(rawChunks) : undefined;

    const saved = await this.prisma.agentMessage.create({
      data: {
        conversationId: convo.id,
        role: 'assistant',
        content: finalContent,
        mode,
        toolCalls: JSON.parse(JSON.stringify(toolCalls)),
        toolResults: results as any,
        tokenCount:
          (completion.usage?.total_tokens ?? 0) + followUpUsageTokens,
      },
    });

    yield {
      type: 'done',
      payload: {
        conversationId: convo.id,
        messageId: saved.id,
        mode,
        content: finalContent,
        toolResults: results,
        sources,
      },
    };
  }

  // ── Confirm a pending action plan ─────────────────────────────────────────

  async confirmAction(
    conversationId: string,
    messageId: string,
    actor: RequestUser,
  ): Promise<AgentResponse> {
    const msg = await this.prisma.agentMessage.findUniqueOrThrow({
      where: { id: messageId },
      select: { actionPlan: true, conversationId: true },
    });

    if (msg.conversationId !== conversationId) {
      throw new ForbiddenException(
        'Message does not belong to this conversation',
      );
    }

    const plan = msg.actionPlan as unknown as ActionPlan;
    if (!plan?.actions?.length) {
      throw new Error('No pending action plan found');
    }

    const results: Array<{ tool: string; result: unknown }> = [];
    const errors: string[] = [];

    for (const action of plan.actions) {
      const start = Date.now();
      const result = await this.toolRouter.execute(
        action.tool,
        action.args,
        actor,
      );

      await this.prisma.agentActionLog.create({
        data: {
          userId: actor.id,
          conversationId,
          messageId,
          toolName: action.tool,
          toolArgs: action.args as any,
          resultSummary: result.success
            ? JSON.stringify(result.data).slice(0, 500)
            : null,
          success: result.success,
          errorMessage: result.error,
          executionMs: Date.now() - start,
        },
      });

      results.push({
        tool: action.tool,
        result: result.success ? result.data : { error: result.error },
      });
      if (!result.success) errors.push(`${action.tool}: ${result.error}`);
    }

    // Build a summary for the user
    const content = errors.length
      ? `Completed with errors:\n${errors.map((e) => `- ${e}`).join('\n')}`
      : `Done! ${this.summarizeResults(results)}`;

    const saved = await this.prisma.agentMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content,
        mode: 'DO',
        toolResults: results as any,
      },
    });

    return {
      conversationId,
      messageId: saved.id,
      mode: 'DO',
      content,
      toolResults: results,
    };
  }

  // ── Execute tool calls immediately ────────────────────────────────────────

  private async executeToolCalls(
    conversationId: string,
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    assistantContent: string | null,
    actor: RequestUser,
    tokenCount: number | undefined,
    /**
     * The exact `messages` array we sent to the FIRST OpenAI call this turn —
     * `[ {system: SYSTEM_PROMPT}, ...history, {user: <this turn's message>} ]`.
     * Reused here so we (a) avoid a redundant Postgres round trip to refetch
     * history and (b) keep the leading system message byte-identical to the
     * first call so OpenAI's automatic prompt cache stays warm.
     */
    priorMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Promise<AgentResponse> {
    const results: Array<{ tool: string; result: unknown }> = [];
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [];

    for (const raw of toolCalls) {
      const tc: any = raw;
      const args = JSON.parse(tc.function.arguments);
      const start = Date.now();
      const result = await this.toolRouter.execute(
        tc.function.name,
        args,
        actor,
      );

      await this.prisma.agentActionLog.create({
        data: {
          userId: actor.id,
          conversationId,
          toolName: tc.function.name,
          toolArgs: args,
          resultSummary: result.success
            ? JSON.stringify(result.data).slice(0, 500)
            : null,
          success: result.success,
          errorMessage: result.error,
          executionMs: Date.now() - start,
        },
      });

      results.push({
        tool: tc.function.name,
        result: result.success ? result.data : { error: result.error },
      });

      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: JSON.stringify(
          result.success ? result.data : { error: result.error },
        ),
      });
    }

    // Call the model again with tool results so it can compose a natural-language response.
    // Reuses `priorMessages` from the first call (no extra DB round trip), then appends
    // the assistant tool-call message, the tool result messages, and finally the
    // follow-up directive as its OWN trailing system message — keeping the leading
    // SYSTEM_PROMPT byte-identical to the first call so prompt caching stays warm.
    const followUp = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        ...priorMessages,
        {
          role: 'assistant' as const,
          content: assistantContent,
          tool_calls: (toolCalls as ToolCallWithFunction[]).map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        ...toolMessages,
        { role: 'system' as const, content: TOOL_FOLLOW_UP_DIRECTIVE },
      ],
      temperature: 0.1,
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const followMsg = followUp.choices[0]?.message;
    if (followMsg?.tool_calls?.length) {
      this.logger.warn(
        `Agent follow-up returned ${followMsg.tool_calls.length} extra tool call(s); not executed in this request.`,
      );
    }

    const finalContent = this.resolveModelReply(followMsg?.content, results);
    const mode = (toolCalls as ToolCallWithFunction[]).some((tc) =>
      MUTATION_TOOLS.has(tc.function.name),
    )
      ? 'DO'
      : 'ASK';

    // Knowledge search: one citation per document, with merged PDF page numbers
    const knowledgeResults = results.find((r) => r.tool === 'knowledge_search');
    const raw = (knowledgeResults?.result as { chunks?: unknown } | undefined)
      ?.chunks;
    const rawChunks = Array.isArray(raw)
      ? raw.filter(
          (c): c is {
            documentId: string;
            title: string;
            text: string;
            pageNumber: number | null;
          } =>
            typeof c === 'object' &&
            c !== null &&
            typeof (c as { documentId?: unknown }).documentId === 'string' &&
            typeof (c as { title?: unknown }).title === 'string' &&
            typeof (c as { text?: unknown }).text === 'string',
        )
      : [];
    const sources =
      rawChunks.length > 0 ? aggregateKnowledgeSources(rawChunks) : undefined;

    const saved = await this.prisma.agentMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: finalContent,
        mode,
        toolCalls: JSON.parse(JSON.stringify(toolCalls)),
        toolResults: results as any,
        tokenCount: (tokenCount ?? 0) + (followUp.usage?.total_tokens ?? 0),
      },
    });

    return {
      conversationId,
      messageId: saved.id,
      mode,
      content: finalContent,
      toolResults: results,
      sources,
    };
  }

  // ── Get conversation history ──────────────────────────────────────────────

  async getConversations(userId: string) {
    return this.prisma.agentConversation.findMany({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  async getMessages(conversationId: string, userId: string) {
    const convo = await this.prisma.agentConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    if (convo.userId !== userId)
      throw new ForbiddenException('Not your conversation');

    return this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        mode: true,
        actionPlan: true,
        toolResults: true,
        createdAt: true,
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Remove redundant "Click Confirm to proceed or Cancel to stop" (and variants) from action summaries. */
  private stripConfirmCancelPhrase(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(
        /\n*Click \*\*Confirm\*\* to proceed or \*\*Cancel\*\* to stop\.?/gi,
        '',
      )
      .replace(/\n*Click Confirm to proceed or Cancel to stop\.?/gi, '')
      .replace(/\n*Confirm to proceed or Cancel to stop\.?/gi, '')
      .replace(/\n*\(Click Confirm or Cancel below\.?\)/gi, '')
      .trimEnd();
  }

  private requiresConfirmation(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    actor: RequestUser,
  ): boolean {
    // For now, keep it simple and safe:
    // ANY mutating tool call requires an explicit confirmation step.
    return (toolCalls as ToolCallWithFunction[]).some((tc) =>
      MUTATION_TOOLS.has(tc.function?.name),
    );
  }

  private assessRisk(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const withFn = toolCalls as ToolCallWithFunction[];
    const mutations = withFn.filter((tc) =>
      MUTATION_TOOLS.has(tc.function.name),
    );
    if (mutations.length === 0) return 'LOW';
    if (
      mutations.some((tc) => {
        if (tc.function.name !== 'update_ticket_status') return false;
        const args = JSON.parse(tc.function.arguments);
        return args.new_status === 'CLOSED';
      })
    )
      return 'HIGH';
    if (mutations.length > 1) return 'MEDIUM';
    return 'LOW';
  }

  /** Non-empty model text, else structured tool summary, else a safe user-facing fallback. */
  private resolveModelReply(
    raw: string | null | undefined,
    results: Array<{ tool: string; result: unknown }>,
  ): string {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed.length > 0) return trimmed;
    const fb = this.summarizeResults(results).trim();
    if (fb.length > 0) return fb;
    return (
      'I ran the tools for your question but did not get a usable reply back. ' +
      'Please try again, or open /tickets to review items in your queue.'
    );
  }

  private toolResultHasError(result: unknown): result is { error: string } {
    return (
      result !== null &&
      typeof result === 'object' &&
      'error' in result &&
      typeof (result as { error?: unknown }).error === 'string' &&
      (result as { error: string }).error.length > 0
    );
  }

  private summarizeResults(results: Array<{ tool: string; result: unknown }>): string {
    const parts: string[] = [];
    for (const r of results) {
      const line = this.summarizeOneToolResult(r.tool, r.result);
      if (line) parts.push(line);
    }
    return parts.join('\n\n');
  }

  private summarizeOneToolResult(tool: string, result: unknown): string {
    if (this.toolResultHasError(result)) {
      return `${tool} failed: ${result.error}`;
    }
    const d = result as Record<string, unknown>;

    switch (tool) {
      case 'search_tickets': {
        const tickets = Array.isArray(d.tickets) ? d.tickets : [];
        const n = tickets.length;
        if (n === 0) {
          return 'No tickets matched that search in your visible scope.';
        }
        const lines = tickets.slice(0, 10).map((t) => {
          const row = t as Record<string, unknown>;
          const title = String(row.title ?? 'Untitled');
          const st = String(row.status ?? '');
          const idShort = String(row.id ?? '').slice(0, 8);
          return `- ${title} — status ${st}${idShort ? ` (id ${idShort}…)` : ''}`;
        });
        const more =
          n > 10
            ? `\n… and ${n - 10} more (ask a narrower question if you need a specific ticket).`
            : '';
        return `Here are the ${n} most recent matching ticket(s):\n${lines.join('\n')}${more}`;
      }
      case 'get_ticket': {
        const title = String(d.title ?? 'Ticket');
        const st = String(d.status ?? '');
        const pr = String(d.priority ?? '');
        return `Ticket: ${title}\n- Status: ${st}\n- Priority: ${pr}`;
      }
      case 'get_ticket_metrics': {
        const counts = Array.isArray(d.counts) ? d.counts : [];
        if (counts.length === 0) {
          return 'Ticket metrics: no rows returned for this filter (or none in your scope).';
        }
        const lines = counts.slice(0, 15).map((c) => {
          const row = c as { group?: unknown; count?: unknown };
          return `- ${String(row.group ?? '')}: ${String(row.count ?? 0)}`;
        });
        return `Ticket counts:\n${lines.join('\n')}`;
      }
      case 'knowledge_search': {
        const chunks = Array.isArray(d.chunks) ? d.chunks : [];
        if (chunks.length === 0) {
          return d.note
            ? `Knowledge search: ${String(d.note)}`
            : 'Knowledge search returned no matching documents.';
        }
        const titles = chunks
          .slice(0, 5)
          .map((ch) => String((ch as { title?: unknown }).title ?? 'Untitled'));
        return `Found ${chunks.length} knowledge excerpt(s). Sources include: ${titles.join('; ')}. Ask a follow-up if you want a specific passage summarized.`;
      }
      case 'get_current_user_context': {
        const role = String(d.role ?? 'unknown');
        const studio = d.studio as { name?: string } | null | undefined;
        const market = d.market as { name?: string } | null | undefined;
        const bits = [`Your role: ${role}`];
        if (studio?.name) bits.push(`Studio: ${studio.name}`);
        if (market?.name) bits.push(`Market: ${market.name}`);
        return bits.join('. ') + '.';
      }
      case 'list_users': {
        const users = Array.isArray(d.users) ? d.users : [];
        if (users.length === 0) return 'No users returned for that filter.';
        const names = users
          .slice(0, 12)
          .map((u) => String((u as { name?: unknown }).name ?? ''))
          .filter(Boolean);
        return `Found ${users.length} user(s): ${names.join(', ')}${users.length > 12 ? ' …' : ''}`;
      }
      case 'list_categories': {
        const cats = Array.isArray(d.categories) ? d.categories : [];
        if (cats.length === 0) return 'No active categories found.';
        const names = cats
          .slice(0, 20)
          .map((c) => String((c as { name?: unknown }).name ?? ''))
          .filter(Boolean);
        return `Categories (${cats.length}): ${names.join(', ')}`;
      }
      case 'query_user_rollups': {
        const counts = Array.isArray(d.counts) ? d.counts : [];
        const disclaimer = String(d.disclaimer ?? '');
        if (counts.length === 0) {
          return 'User rollups: no rows for this filter.';
        }
        const lines = counts.slice(0, 12).map((c) => {
          const row = c as { group?: unknown; count?: unknown };
          return `- ${String(row.group ?? '')}: ${String(row.count ?? 0)}`;
        });
        return `User counts:\n${lines.join('\n')}${disclaimer ? `\n(${disclaimer})` : ''}`;
      }
      case 'create_ticket':
        return `Created ticket "${String((d as { title?: unknown }).title ?? '')}" (${String((d as { ticket_id?: unknown }).ticket_id ?? '').slice(0, 8)}…)`;
      case 'update_ticket_status':
        return `Updated status: ${String((d as { old_status?: unknown }).old_status)} → ${String((d as { new_status?: unknown }).new_status)}`;
      case 'assign_ticket':
        return `Assigned to ${String((d as { assigned_to?: unknown }).assigned_to)}`;
      case 'add_ticket_comment':
        return 'Added comment on ticket';
      case 'create_subtask':
        return `Created subtask "${String((d as { title?: unknown }).title ?? '')}"`;
      default:
        return `Completed ${tool.replace(/_/g, ' ')}.`;
    }
  }

  private buildHistoryMessages(
    history: Array<{
      role: string;
      content: string | null;
      toolCalls: unknown;
      toolResults: unknown;
    }>,
  ) {
    return history
      .filter((h) => h.content && (h.role === 'user' || h.role === 'assistant'))
      .map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content!,
      }));
  }

  private async tryBuildCreateTicketPlan(
    message: string,
  ): Promise<ActionPlan | null> {
    const lower = message.toLowerCase();
    const asksToCreateTicket =
      /(?:create|make|open)\s+(?:a\s+)?(?:new\s+)?(?:.*\s+)?ticket/.test(
        lower,
      ) || /new\s+ticket/.test(lower);

    if (!asksToCreateTicket) return null;

    const categories = await this.prisma.maintenanceCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });

    const matchedCategory = categories.find((c) =>
      lower.includes(c.name.toLowerCase()),
    );

    // Need category for deterministic creation. If absent, fall back to model.
    if (!matchedCategory) return null;

    const priority = lower.includes('urgent')
      ? 'URGENT'
      : lower.includes('high')
        ? 'HIGH'
        : lower.includes('low')
          ? 'LOW'
          : 'MEDIUM';

    const locationMatch =
      message.match(/at\s+the\s+(.+?)\s+location/i) ||
      message.match(/in\s+the\s+(.+?)\s+location/i) ||
      message.match(/at\s+(.+?)\s+location/i);
    const location = locationMatch?.[1]?.trim();

    const title = location
      ? `${matchedCategory.name} issue at ${location}`
      : `${matchedCategory.name} issue`;

    const description = [
      `Requested via AI Agent`,
      `Category: ${matchedCategory.name}`,
      `Priority: ${priority}`,
      location ? `Location: ${location}` : null,
      `Original request: ${message}`,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      summary:
        `I can create this ticket now.\n\n` +
        `- **Category**: ${matchedCategory.name}\n` +
        `- **Priority**: ${priority}\n` +
        (location ? `- **Location**: ${location}` : ''),
      risk_level: 'LOW',
      actions: [
        {
          tool: 'create_ticket',
          args: {
            title,
            description,
            priority,
            category_id: matchedCategory.id,
          },
        },
      ],
    };
  }

  private async checkQuota(actor: RequestUser) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.prisma.agentMessage.count({
      where: {
        conversation: { userId: actor.id },
        role: 'user',
        createdAt: { gte: today },
      },
    });

    if (count >= DAILY_QUOTA) {
      throw new ForbiddenException(
        `Daily AI agent quota reached (${DAILY_QUOTA} messages/day). Try again tomorrow.`,
      );
    }
  }
}
