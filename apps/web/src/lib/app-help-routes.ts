/**
 * Allowlisted in-app paths for Assistant chat linkification (matches platform user guide).
 * Longest paths first so /admin/workflow-templates/new wins over /admin/workflow-templates.
 */
export const APP_HELP_STATIC_PATHS: readonly string[] = [
  '/admin/workflow-templates/new',
  '/admin/email-automation',
  '/admin/system-monitoring',
  '/admin/knowledge-base',
  '/admin/lease-iq',
  '/admin/workflow-templates',
  '/admin/dispatch',
  '/admin/users',
  '/admin/markets',
  '/portal/tickets',
  '/tickets/new',
  '/notifications',
  '/dashboard',
  '/assistant',
  '/handbook',
  '/inbox',
  '/portal',
  '/tickets',
].sort((a, b) => b.length - a.length);

const CUID = /^c[a-z0-9]{24}$/;

/** True if the path segment has ended (punctuation, whitespace, end). */
function isPathTerminator(ch: string | undefined): boolean {
  if (ch == null || ch === '') return true;
  return /[\s.,;:!?)\]'">]/.test(ch);
}

export type HelpRouteMatch = { href: string; length: number };

/**
 * If `text[pos]` starts an allowlisted app path, returns href and total character length.
 */
function isAppPathStartChar(before: string): boolean {
  if (!before) return true;
  if (/\s/.test(before)) return true;
  return '([{\'"'.includes(before);
}

export function matchAppHelpRoute(text: string, pos: number): HelpRouteMatch | null {
  if (text[pos] !== '/') return null;
  const before = pos > 0 ? text[pos - 1] : '';
  if (!isAppPathStartChar(before)) return null;

  for (const p of APP_HELP_STATIC_PATHS) {
    if (pos + p.length > text.length) continue;
    if (text.slice(pos, pos + p.length) !== p) continue;
    const after = text[pos + p.length];
    if (!isPathTerminator(after)) continue;
    return { href: p, length: p.length };
  }

  const dynamicPrefixes: { prefix: string; build: (id: string) => string }[] = [
    { prefix: '/tickets/', build: (id) => `/tickets/${id}` },
    { prefix: '/locations/', build: (id) => `/locations/${id}` },
    { prefix: '/admin/dispatch/groups/', build: (id) => `/admin/dispatch/groups/${id}` },
    { prefix: '/admin/workflow-templates/', build: (id) => `/admin/workflow-templates/${id}` },
  ];

  for (const { prefix, build } of dynamicPrefixes) {
    if (!text.slice(pos).startsWith(prefix)) continue;
    const idStart = pos + prefix.length;
    const idSlice = text.slice(idStart, idStart + 25);
    if (idSlice.length !== 25 || !CUID.test(idSlice)) continue;
    const afterId = text[idStart + 25];
    if (!isPathTerminator(afterId)) continue;
    return { href: build(idSlice), length: prefix.length + 25 };
  }

  return null;
}
