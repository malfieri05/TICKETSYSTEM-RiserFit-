import { NotificationEventType } from '@prisma/client';

export interface DomainEvent {
  type: NotificationEventType;
  ticketId: string;
  actorId: string;
  occurredAt: Date;
  payload: DomainEventPayload;
}

export type DomainEventPayload =
  | TicketCreatedPayload
  | TicketAssignedPayload
  | TicketStatusChangedPayload
  | TicketResolvedPayload
  | TicketClosedPayload
  | CommentAddedPayload
  | MentionInCommentPayload
  | SubtaskAssignedPayload
  | SubtaskCompletedPayload
  | SubtaskBlockedPayload
  | SubtaskBecameReadyPayload;

export interface TicketCreatedPayload {
  requesterId: string;
  ownerId?: string;
  title: string;
}

export interface TicketAssignedPayload {
  ownerId: string;
  ownerName: string;
  previousOwnerId?: string;
  title: string;
}

export interface TicketStatusChangedPayload {
  previousStatus: string;
  newStatus: string;
  requesterId: string;
  ownerId?: string;
  title: string;
}

export interface TicketResolvedPayload {
  requesterId: string;
  title: string;
}

export interface TicketClosedPayload {
  requesterId: string;
  title: string;
}

export interface CommentAddedPayload {
  commentId: string;
  authorId: string;
  authorName: string;
  requesterId: string;
  ownerId?: string;
  bodyPreview: string;
  isInternal: boolean;
  mentionedUserIds?: string[];
  parentCommentId?: string;
}

export interface MentionInCommentPayload {
  commentId: string;
  mentionedUserIds: string[];
  authorId: string;
  authorName: string;
  bodyPreview: string;
  parentCommentId?: string;
}

export interface SubtaskAssignedPayload {
  subtaskId: string;
  subtaskTitle: string;
  ownerId: string;
}

export interface SubtaskCompletedPayload {
  subtaskId: string;
  subtaskTitle: string;
  ticketOwnerId?: string;
}

export interface SubtaskBlockedPayload {
  subtaskId: string;
  subtaskTitle: string;
  ticketOwnerId?: string;
}

export interface SubtaskBecameReadyPayload {
  subtaskId: string;
  subtaskTitle: string;
  ticketId: string;
  departmentId: string | null;
  ownerId: string | null;
}
