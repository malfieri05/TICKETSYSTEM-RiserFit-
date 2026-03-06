/**
 * OpenAI-compatible tool definitions for the AI Agent.
 * Each tool maps to a backend service call executed via the ToolRouter.
 */
export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const AGENT_TOOLS: ToolDef[] = [
  // ── User & Context ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_current_user_context',
      description:
        'Get the logged-in user\'s id, role, team, studio, market, and permissions scope.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  // ── Tickets ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_tickets',
      description:
        'Search tickets with filters. Returns lightweight ticket summaries. Use this to look up tickets before performing actions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search on title/description' },
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED', 'CLOSED'],
            },
            description: 'Filter by one or more statuses',
          },
          priority: {
            type: 'array',
            items: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          },
          category_id: { type: 'string' },
          owner_user_id: { type: 'string' },
          requester_user_id: { type: 'string' },
          limit: { type: 'number', description: 'Max results (default 10, max 25)' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_ticket',
      description:
        'Get full details for a single ticket including comments, subtasks, and watchers.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string', description: 'The ticket ID (cuid)' },
        },
        required: ['ticket_id'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description:
        'Create a new ticket. Requires title. Category, priority, and description are recommended.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Ticket title (required)' },
          description: { type: 'string', description: 'Detailed description' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          category_id: { type: 'string', description: 'Category ID' },
          owner_user_id: { type: 'string', description: 'User ID to assign the ticket to' },
        },
        required: ['title'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'update_ticket_status',
      description:
        'Transition a ticket to a new status. Must follow the valid state machine transitions.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          new_status: {
            type: 'string',
            enum: ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED', 'CLOSED'],
          },
        },
        required: ['ticket_id', 'new_status'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'assign_ticket',
      description: 'Assign or unassign a ticket to a user.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          owner_user_id: { type: 'string', description: 'User ID to assign, or null to unassign' },
        },
        required: ['ticket_id'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'add_ticket_comment',
      description: 'Add a comment to a ticket. Can be public or internal (agent/admin only).',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          body: { type: 'string', description: 'Comment text' },
          is_internal: { type: 'boolean', description: 'Whether this is an internal note (default false)' },
        },
        required: ['ticket_id', 'body'],
      },
    },
  },

  // ── Subtasks ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_subtask',
      description: 'Create a subtask on a ticket.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          title: { type: 'string' },
          owner_user_id: { type: 'string', description: 'Assign to this user' },
          is_required: { type: 'boolean', description: 'Whether ticket resolution requires this subtask to be done (default true)' },
        },
        required: ['ticket_id', 'title'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'update_subtask_status',
      description: 'Update a subtask\'s status.',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          subtask_id: { type: 'string' },
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] },
        },
        required: ['ticket_id', 'subtask_id', 'status'],
      },
    },
  },

  // ── Reporting ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_ticket_metrics',
      description:
        'Get ticket counts. Use for "how many X tickets" questions. Group by status, priority, category, or market. Optionally filter by priority (e.g. URGENT) or status first.',
      parameters: {
        type: 'object',
        properties: {
          group_by: {
            type: 'string',
            enum: ['status', 'priority', 'category', 'market'],
            description: 'Dimension to group by. Use priority for "how many urgent/high/low" questions.',
          },
          priority: {
            type: 'array',
            items: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            description: 'Optional: filter to these priorities only (e.g. ["URGENT"] for urgent count)',
          },
          status: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: filter to specific statuses before grouping',
          },
        },
        required: ['group_by'],
      },
    },
  },

  // ── Knowledge Base (RAG) ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'knowledge_search',
      description:
        'Search the company knowledge base (RiserU docs, internal docs). Use this to answer policy or process questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The question or search query' },
          limit: { type: 'number', description: 'Max chunks to retrieve (default 5)' },
        },
        required: ['query'],
      },
    },
  },

  // ── Lookup helpers ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'List all active ticket categories. Use this when the user wants to create a ticket and you need the category_id.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  {
    type: 'function',
    function: {
      name: 'list_users',
      description: 'List users (agents/admins) who can be assigned tickets. Use this when you need a user ID for assignment.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['STUDIO_USER', 'DEPARTMENT_USER', 'ADMIN'], description: 'Filter by role' },
        },
      },
    },
  },
];

/** Tools that mutate data and may require confirmation */
export const MUTATION_TOOLS = new Set([
  'create_ticket',
  'update_ticket_status',
  'assign_ticket',
  'add_ticket_comment',
  'create_subtask',
  'update_subtask_status',
]);

/** Tools that always require confirmation before execution */
export const CONFIRMATION_REQUIRED_TOOLS = new Set([
  'update_ticket_status', // closing/resolving
]);

/** Status transitions that require explicit confirmation */
export const CONFIRM_STATUS_TRANSITIONS = new Set(['RESOLVED', 'CLOSED']);
