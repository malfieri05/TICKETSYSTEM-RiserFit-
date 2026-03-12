/**
 * Canonical comment/author response contract.
 * Maps Prisma user fields (name) into a stable API shape so all consumers
 * get author.displayName without contract drift.
 */

export type CommentAuthorResponse = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  displayName: string;
};

type AuthorInput = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
};

function mapAuthor(author: AuthorInput | null | undefined): CommentAuthorResponse | null {
  if (!author) return null;
  return {
    ...author,
    avatarUrl: author.avatarUrl ?? null,
    displayName: author.name ?? '',
  };
}

/**
 * Maps a comment (from Prisma or any source) to the canonical response shape
 * with author.displayName set from author.name. Use in CommentsService and
 * anywhere ticket.comments are returned (e.g. TicketsService.findById).
 */
export function mapCommentToResponse<T extends { author?: AuthorInput | null }>(
  comment: T,
): Omit<T, 'author'> & { author: CommentAuthorResponse | null } {
  return {
    ...comment,
    author: mapAuthor(comment.author),
  } as Omit<T, 'author'> & { author: CommentAuthorResponse | null };
}
