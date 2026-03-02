import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * MentionParserService
 * ====================
 * Extracts @mention references from comment bodies and resolves them to user IDs.
 *
 * Mention format: @[UserName](userId)  — structured mention
 *   OR            @username            — plain text mention (fuzzy matched against DB)
 *
 * We store mention records so the notification system knows exactly
 * which users were mentioned without re-parsing the comment body later.
 */
@Injectable()
export class MentionParserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Parse structured mentions: @[Display Name](userId)
   * Returns array of unique user IDs found in the body.
   */
  parseStructuredMentions(body: string): string[] {
    // Matches @[Any Name](cuid_or_uuid_here)
    const mentionRegex = /@\[.+?\]\(([a-zA-Z0-9_-]+)\)/g;
    const userIds: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(body)) !== null) {
      const userId = match[1];
      if (!userIds.includes(userId)) {
        userIds.push(userId);
      }
    }

    return userIds;
  }

  /**
   * Validate that all mentioned user IDs exist and are active.
   * Returns only the IDs that are valid — silently drops invalid ones
   * (user may have been deactivated since the mention was typed).
   */
  async resolveValidMentions(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }

  /**
   * Full pipeline: parse + validate in one call.
   * Returns valid user IDs that were mentioned.
   */
  async extractMentions(body: string): Promise<string[]> {
    const parsed = this.parseStructuredMentions(body);
    return this.resolveValidMentions(parsed);
  }
}
