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

const SYSTEM_PROMPT = `You are an AI assistant for an internal ticketing system used by ~500 employees.

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

RULES:
1. Use tools to get data before answering questions. Don't guess.
2. For actions: always include the appropriate tool calls. Let the UI handle confirmation.
3. Be concise. Use bullet points. No fluff.
4. When citing knowledge base results, mention the source title.
5. If you can't do something due to permissions, explain why.
6. Never fabricate ticket IDs, user IDs, or data.
7. If asked about something not in your scope, say so and suggest they contact their manager or team. Never suggest submitting a ticket.
8. For "how do I…", "where do I…", or "how does the system work" (using the app, not company HR policy): call knowledge_search first. The knowledge base includes a Platform user guide with real URL paths. Ground answers in retrieved chunks; if nothing matches, say the guide does not cover it and suggest an admin or manager.
9. When the answer depends on whether the user is a studio user, department user, or admin (e.g. Admin-only screens), call get_current_user_context first, then tailor steps. Never tell a user to open an admin URL if their role is not ADMIN.

TOOL USAGE:
- "How many [urgent/high/medium/low] tickets?" → ALWAYS use get_ticket_metrics with group_by: "priority". Optionally pass priority: ["URGENT"] (or HIGH, etc.) to filter. Then answer with the number(s) from the returned counts.
- "How many tickets by status/category/market?" → use get_ticket_metrics with the right group_by.
- "How many live / open maintenance tickets today?" → get_ticket_metrics with ticket_class: "MAINTENANCE", open_only: true, date_preset: "today", group_by: "status" (or "studio" for a breakdown). Counts only include tickets the user is allowed to see.
- "Which studio has the most maintenance issues (historically)?" → get_ticket_metrics with group_by: "studio", ticket_class: "MAINTENANCE", limit: 10 (omit date_preset for all time, or use last_30_days / last_7_days for a window).
- "Most new hires / new users by studio?" → use query_user_rollups with group_by: "studio" and the right date_preset or created_after/created_before. Tell the user these are account signups (User.createdAt), not HR hire dates, if the tool disclaimer applies.
- To look up specific tickets: use search_tickets or get_ticket.
- Handbook, policy, retail tips, HR, procedures, or "what does the company say about…": use knowledge_search first.
- How to use the ticketing app (create a maintenance ticket, workflow templates, dispatch groups, reporting, inbox, portal vs /tickets, Assistant vs Handbook): use knowledge_search first. Include concrete paths from the retrieved guide (e.g. /tickets/new, /admin/dispatch) when they appear in the context.
- Create/modify tickets: use the appropriate mutation tool.
- Find categories or assignees: use list_categories or list_users.

FORMAT:
- Keep responses under 300 words unless the user explicitly asks for detail.
- Use plain text only in the chat UI: do NOT use markdown (no **bold**, no # headings, no \`code\` fences). Use simple line breaks; use hyphen bullets like "- Item" without asterisks around words.
- When you mention an in-app URL, write it as a plain path starting with / so the UI can link it (example: open /admin/workflow-templates).`;

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
    await this.checkQuota(actor);

    // Get or create conversation
    const convo = conversationId
      ? await this.prisma.agentConversation.findUniqueOrThrow({
          where: { id: conversationId },
        })
      : await this.prisma.agentConversation.create({
          data: { userId: actor.id },
        });

    // Save user message
    const userMsg = await this.prisma.agentMessage.create({
      data: { conversationId: convo.id, role: 'user', content: message },
    });

    // Load history
    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true, toolCalls: true, toolResults: true },
    });

    // Deterministic fast-path:
    // If the user clearly asks to create a ticket and provided enough details,
    // immediately return a DO ActionPlan with Confirm/Cancel (no extra prompting).
    const directPlan = await this.tryBuildCreateTicketPlan(message);
    if (directPlan) {
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

    // Build messages for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.buildHistoryMessages(history),
    ];

    // Call OpenAI with tool definitions — force tool usage so the model
    // never responds with just text when it should be calling tools.
    const completion = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools: AGENT_TOOLS as OpenAI.Chat.Completions.ChatCompletionTool[],
      tool_choice: 'required',
      temperature: 0.1,
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) throw new Error('No response from model');

    // Fallback: if somehow still no tool calls
    if (!assistantMessage.tool_calls?.length) {
      const saved = await this.prisma.agentMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: assistantMessage.content,
          mode: 'ASK',
          tokenCount: completion.usage?.total_tokens,
        },
      });

      return {
        conversationId: convo.id,
        messageId: saved.id,
        mode: 'ASK',
        content: assistantMessage.content ?? '',
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

    // Execute tools immediately (no confirmation needed)
    return this.executeToolCalls(
      convo.id,
      toolCalls,
      assistantMessage.content,
      actor,
      completion.usage?.total_tokens,
    );
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
    tokenCount?: number,
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

    // Call the model again with tool results so it can compose a natural-language response
    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });

    const followUp = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history
          .filter((h) => h.content)
          .map((h) => ({
            role: h.role as 'user' | 'assistant',
            content: h.content!,
          })),
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
      ],
      temperature: 0.1,
      max_tokens: MAX_OUTPUT_TOKENS,
    });

    const finalContent =
      followUp.choices[0]?.message?.content ?? this.summarizeResults(results);
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

  private summarizeResults(
    results: Array<{ tool: string; result: unknown }>,
  ): string {
    return results
      .map((r) => {
        const d = r.result as any;
        if (r.tool === 'create_ticket')
          return `Created ticket "${d?.title}" (${d?.ticket_id?.slice(0, 8)})`;
        if (r.tool === 'update_ticket_status')
          return `Updated status: ${d?.old_status} → ${d?.new_status}`;
        if (r.tool === 'assign_ticket') return `Assigned to ${d?.assigned_to}`;
        if (r.tool === 'add_ticket_comment') return `Added comment on ticket`;
        if (r.tool === 'create_subtask') return `Created subtask "${d?.title}"`;
        return `Executed ${r.tool}`;
      })
      .join('. ');
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
