'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Send, Reply as ReplyIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { commentsApi, mentionableUsersApi, invalidateTicketLists } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { getMutationErrorMessage } from '@/lib/utils';
import { POLISH_THEME } from '@/lib/polish';

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
  mentions?: { user: { id: string; name: string } }[];
  replies?: CommentData[];
}

interface Props {
  ticketId: string;
  comments: CommentData[];
  isStudioUser?: boolean;
}

const COLLAPSE_THRESHOLD = 5;

export function CommentThread({ ticketId, comments, isStudioUser }: Props) {
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
    onSuccess: () => {
      setCommentBody('');
      setReplyBody('');
      setReplyingTo(null);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      invalidateTicketLists(qc);
    },
  });

  const toggleExpand = (commentId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const handleSubmitComment = () => {
    if (!commentBody.trim()) return;
    commentMut.mutate({ body: commentBody });
  };

  const handleSubmitReply = (parentId: string) => {
    if (!replyBody.trim()) return;
    commentMut.mutate({ body: replyBody, parentCommentId: parentId });
  };

  return (
    <div className="space-y-3">
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
                className="flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer"
                style={{ color: POLISH_THEME.accent }}
              >
                <ReplyIcon className="h-3 w-3" />
                Reply
              </button>
            </CommentBubble>

            {/* Replies */}
            {visibleReplies.length > 0 && (
              <div className="ml-6 border-l-2 pl-3 space-y-2 mt-1" style={{ borderColor: POLISH_THEME.innerBorder }}>
                {visibleReplies.map((reply) => (
                  <CommentBubble key={reply.id} comment={reply} ticketId={ticketId} isReply />
                ))}
              </div>
            )}

            {hasMany && (
              <div className="ml-6 pl-3 mt-1">
                <button
                  onClick={() => toggleExpand(comment.id)}
                  className="flex items-center gap-1 text-xs font-medium cursor-pointer"
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
}

function CommentBubble({
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
      className={`rounded-xl p-4 space-y-2 ${isReply ? 'py-3' : ''}`}
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
}

function CommentBodyRenderer({ body }: { body: string }) {
  const mentionRegex = /@\[(.+?)\]\([a-zA-Z0-9_-]+\)/g;
  const parts: (string | JSX.Element)[] = [];
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
}

function MentionComposer({
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

  return (
    <div
      className="rounded-xl overflow-hidden"
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

        {/* Mention typeahead dropdown */}
        {mentionSearch !== null && mentionableUsers.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-2 bottom-full mb-1 w-72 max-h-48 overflow-y-auto rounded-lg shadow-lg z-50"
            style={{
              background: 'var(--color-bg-surface-raised)',
              border: `1px solid ${POLISH_THEME.listBorder}`,
            }}
          >
            {mentionableUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-surface)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
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
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.displayName}</div>
                  <div className="text-xs truncate" style={{ color: POLISH_THEME.metaDim }}>
                    {u.email}
                  </div>
                </div>
              </button>
            ))}
          </div>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
