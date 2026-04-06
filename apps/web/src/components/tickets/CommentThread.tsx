'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Send, Reply as ReplyIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { commentsApi, mentionableUsersApi, invalidateTicketLists } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { getMutationErrorMessage } from '@/lib/utils';
import { POLISH_THEME } from '@/lib/polish';
import { TOOLTIP_PORTAL_Z_INDEX, TOOLTIP_VIEWPORT_MARGIN } from '@/lib/tooltip-layer';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

interface CommentAuthor {
  id: string;
  name?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
}

interface MentionUser {
  id: string;
  name: string | null;
  email: string;
  displayName: string;
}

interface CommentData {
  id: string;
  body: string;
  author: CommentAuthor | null;
  createdAt: string;
  editedAt?: string | null;
  parentCommentId?: string | null;
  mentions?: { mentionedUser: { id: string; displayName: string } }[];
  replies?: CommentData[];
}

interface Props {
  ticketId: string;
  comments: CommentData[];
  isStudioUser?: boolean;
}

const COLLAPSE_THRESHOLD = 5;

const CommentThreadComponent = function CommentThread({ ticketId, comments, isStudioUser }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const commentMut = useMutation({
    mutationFn: (data: { body: string; parentCommentId?: string }) =>
      commentsApi.create(ticketId, data),
    onMutate: (variables) => {
      const snapshot = qc.getQueryData(['ticket', ticketId]) as { comments: CommentData[] } | undefined;
      const prev = snapshot ?? { comments: [] };
      const optimisticId = `opt-${Date.now()}`;
      const optimisticAuthor: CommentAuthor | null = user
        ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null }
        : null;
      const optimisticComment: CommentData = {
        id: optimisticId,
        body: variables.body,
        author: optimisticAuthor,
        createdAt: new Date().toISOString(),
        editedAt: null,
        parentCommentId: variables.parentCommentId ?? null,
        mentions: [],
        replies: [],
      };
      let updatedComments: CommentData[];
      if (variables.parentCommentId) {
        updatedComments = (prev.comments ?? []).map((c) =>
          c.id === variables.parentCommentId
            ? { ...c, replies: [...(c.replies ?? []), optimisticComment] }
            : c,
        );
      } else {
        updatedComments = [...(prev.comments ?? []), optimisticComment];
      }
      qc.setQueryData(['ticket', ticketId], { ...prev, comments: updatedComments });
      setCommentBody('');
      setReplyBody('');
      setReplyingTo(null);
      return { snapshot };
    },
    onError: (_err, _variables, context) => {
      if (context?.snapshot != null) {
        qc.setQueryData(['ticket', ticketId], context.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      invalidateTicketLists(qc);
    },
  });

  const toggleExpand = useCallback((commentId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }, []);

  const handleSubmitComment = useCallback(() => {
    if (!commentBody.trim()) return;
    commentMut.mutate({ body: commentBody });
  }, [commentBody, commentMut]);

  const handleSubmitReply = useCallback((parentId: string) => {
    if (!replyBody.trim()) return;
    commentMut.mutate({ body: replyBody, parentCommentId: parentId });
  }, [replyBody, commentMut]);

  return (
    <div className="space-y-4">
      {comments.length === 0 && (
        <p className="text-sm text-center py-6" style={{ color: POLISH_THEME.theadText }}>
          {isStudioUser ? 'No updates yet.' : 'No comments yet.'}
        </p>
      )}

      {comments.map((comment) => {
        const replies = comment.replies ?? [];
        const hasMany = replies.length > COLLAPSE_THRESHOLD;
        const isExpanded = expandedThreads.has(comment.id);
        const visibleReplies = hasMany && !isExpanded ? replies.slice(0, COLLAPSE_THRESHOLD) : replies;

        return (
          <div key={comment.id} className="space-y-0">
            {/* Top-level comment */}
            <CommentBubble comment={comment} ticketId={ticketId}>
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyBody('');
                }}
                className="focus-ring flex items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-xs font-medium transition-colors cursor-pointer"
                style={{ color: POLISH_THEME.accent }}
              >
                <ReplyIcon className="h-3 w-3" />
                Reply
              </button>
            </CommentBubble>

            {/* Replies */}
            {visibleReplies.length > 0 && (
              <div className="ml-6 border-l-2 pl-3.5 space-y-2.5 mt-1.5" style={{ borderColor: POLISH_THEME.innerBorder }}>
                {visibleReplies.map((reply) => (
                  <CommentBubble key={reply.id} comment={reply} ticketId={ticketId} isReply />
                ))}
              </div>
            )}

            {hasMany && (
              <div className="ml-6 pl-3 mt-1">
                <button
                  onClick={() => toggleExpand(comment.id)}
                  className="focus-ring flex items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-xs font-medium cursor-pointer"
                  style={{ color: POLISH_THEME.accent }}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Show fewer replies
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show all {replies.length} replies
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Reply composer */}
            {replyingTo === comment.id && (
              <div className="ml-6 pl-3 mt-2">
                <MentionComposer
                  ticketId={ticketId}
                  value={replyBody}
                  onChange={setReplyBody}
                  placeholder="Write a reply..."
                  onSubmit={() => handleSubmitReply(comment.id)}
                  isPending={commentMut.isPending}
                  error={commentMut.isError ? getMutationErrorMessage(commentMut.error, 'Failed to add reply.') : undefined}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Top-level comment composer */}
      <MentionComposer
        ticketId={ticketId}
        value={commentBody}
        onChange={setCommentBody}
        placeholder={isStudioUser ? 'Add an update...' : 'Write a comment...'}
        onSubmit={handleSubmitComment}
        isPending={commentMut.isPending}
        error={commentMut.isError && !replyingTo ? getMutationErrorMessage(commentMut.error, 'Failed to add comment.') : undefined}
        buttonLabel={canManage ? 'Comment' : 'Add update'}
      />
    </div>
  );
};

export const CommentThread = memo(CommentThreadComponent);

const CommentBubble = memo(function CommentBubble({
  comment,
  ticketId,
  isReply,
  children,
}: {
  comment: CommentData;
  ticketId: string;
  isReply?: boolean;
  children?: React.ReactNode;
}) {
  const displayName = comment.author?.displayName ?? comment.author?.name ?? '?';

  return (
    <div
      className={`rounded-[var(--radius-lg)] p-4 space-y-2.5 transition-all duration-[var(--duration-fast)] ease-out hover:shadow-[var(--shadow-panel)] hover:border-[rgba(52,120,196,0.3)] hover:-translate-y-px ${isReply ? 'py-3' : ''}`}
      style={{
        background: POLISH_THEME.listBg,
        border: `1px solid ${POLISH_THEME.innerBorder}`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ background: isReply ? 'var(--color-text-muted)' : 'var(--color-accent)', fontSize: '0.65rem' }}
        >
          {displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {displayName}
        </span>
        <span className="ml-auto text-xs shrink-0" style={{ color: POLISH_THEME.theadText }}>
          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          {comment.editedAt && ' (edited)'}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
        <CommentBodyRenderer body={comment.body} />
      </p>
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
});

const CommentBodyRenderer = memo(function CommentBodyRenderer({ body }: { body: string }) {
  const mentionRegex = /@\[(.+?)\]\([a-zA-Z0-9_-]+\)/g;
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className="font-medium px-0.5 rounded"
        style={{ color: POLISH_THEME.accent, background: `${POLISH_THEME.accent}15` }}
      >
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return <>{parts}</>;
});

const MentionComposer = memo(function MentionComposer({
  ticketId,
  value,
  onChange,
  placeholder,
  onSubmit,
  isPending,
  error,
  buttonLabel = 'Comment',
}: {
  ticketId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
  isPending: boolean;
  error?: string;
  buttonLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [menuFixed, setMenuFixed] = useState({
    left: 0,
    top: 0,
    transform: 'translateY(-100%)',
  });

  const { data: mentionableRes } = useQuery({
    queryKey: ['mentionable-users', ticketId, mentionSearch],
    queryFn: () => mentionableUsersApi.list(ticketId, mentionSearch ?? undefined),
    enabled: mentionSearch !== null,
    staleTime: 30_000,
  });
  const mentionableUsers: MentionUser[] = (mentionableRes?.data ?? mentionableRes ?? []) as MentionUser[];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && mentionSearch === null) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape' && mentionSearch !== null) {
      setMentionSearch(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionStart(cursorPos - atMatch[1].length - 1);
      setMentionSearch(atMatch[1]);
    } else {
      setMentionSearch(null);
    }
  };

  const insertMention = useCallback(
    (user: MentionUser) => {
      const token = `@[${user.displayName}](${user.id})`;
      const before = value.slice(0, mentionStart);
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const after = value.slice(cursorPos);
      const newValue = before + token + ' ' + after;
      onChange(newValue);
      setMentionSearch(null);

      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const pos = before.length + token.length + 1;
          ta.selectionStart = pos;
          ta.selectionEnd = pos;
          ta.focus();
        }
      });
    },
    [value, mentionStart, onChange],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionSearch(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (mentionSearch === null || mentionableUsers.length === 0) return;
    if (typeof window === 'undefined') return;

    const reposition = () => {
      const ta = textareaRef.current;
      const menu = dropdownRef.current;
      if (!ta) return;
      const tr = getZoomedRect(ta);
      const vp = getZoomedViewport();
      const m = TOOLTIP_VIEWPORT_MARGIN;
      const w = menu ? getZoomedRect(menu).width : 288;
      const h = menu ? getZoomedRect(menu).height : 160;
      let left = tr.left + 8;
      let top = tr.top - 4;
      let transform = 'translateY(-100%)';
      left = Math.max(m, Math.min(vp.width - m - w, left));
      if (h > 0 && top - h < m) {
        top = tr.bottom + 4;
        transform = 'translateY(0)';
      }
      if (h > 0 && transform === 'translateY(0)' && top + h > vp.height - m) {
        top = Math.max(m, vp.height - m - h);
      }
      setMenuFixed({ left, top, transform });
    };

    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [mentionSearch, mentionableUsers.length]);

  return (
    <div
      className="dashboard-card rounded-[var(--radius-lg)] overflow-hidden"
      style={{
        background: POLISH_THEME.listBg,
        border: `1px solid ${POLISH_THEME.listBorder}`,
        borderLeft: `3px solid ${POLISH_THEME.accent}`,
      }}
    >
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={3}
          style={{ background: 'transparent', border: 'none', borderRadius: 0 } as React.CSSProperties}
        />

        {mentionSearch !== null &&
          mentionableUsers.length > 0 &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              aria-label="Mention user"
              className="fixed box-border w-[min(18rem,calc(100vw-1rem))] max-h-48 overflow-y-auto rounded-[var(--radius-md)] [scrollbar-width:thin]"
              style={{
                left: menuFixed.left,
                top: menuFixed.top,
                transform: menuFixed.transform,
                zIndex: TOOLTIP_PORTAL_Z_INDEX,
                background: 'var(--color-bg-surface-raised)',
                border: `1px solid ${POLISH_THEME.listBorder}`,
                boxShadow: 'var(--shadow-panel)',
              }}
            >
              {mentionableUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  className="focus-ring w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer hover:bg-[var(--color-bg-surface)]"
                  style={{ color: 'var(--color-text-primary)' }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(u);
                  }}
                >
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ background: 'var(--color-accent)', fontSize: '0.6rem' }}
                  >
                    {(u.displayName ?? u.email)[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{u.displayName}</div>
                    <div className="text-xs break-words" style={{ color: POLISH_THEME.metaDim }}>
                      {u.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>

      <div
        className="flex flex-col gap-2 px-3 py-2"
        style={{ borderTop: `1px solid ${POLISH_THEME.innerBorder}`, background: 'var(--color-bg-surface)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: POLISH_THEME.metaDim }}>
            Type @ to mention
          </span>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!value.trim() || isPending}
            loading={isPending}
          >
            <Send className="h-3.5 w-3.5" />
            {buttonLabel}
          </Button>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    </div>
  );
});
