import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class MentionParserService {
  constructor(private prisma: PrismaService) {}

  /**
   * Parse structured mentions: @[Display Name](userId)
   * Returns array of unique user IDs found in the body.
   */
  parseStructuredMentions(body: string): string[] {
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

  /**
   * Stage 3: ticket-scoped mention extraction with strict validation.
   * - Rejects 400 if any mentioned userId does not exist or is inactive.
   * - Rejects 400 if any mentioned user exists but is not mentionable for this ticket.
   * - Does not silently strip invalid mentions.
   */
  async extractMentionsForTicket(
    body: string,
    allowedUserIds: string[],
  ): Promise<string[]> {
    const parsed = this.parseStructuredMentions(body);
    if (parsed.length === 0) return [];

    const existingActive = await this.prisma.user.findMany({
      where: {
        id: { in: parsed },
        isActive: true,
      },
      select: { id: true },
    });
    const existingIds = new Set(existingActive.map((u) => u.id));

    const nonExistentOrInactive = parsed.filter((id) => !existingIds.has(id));
    if (nonExistentOrInactive.length > 0) {
      throw new BadRequestException(
        `One or more mentioned users do not exist or are inactive: ${nonExistentOrInactive.join(', ')}`,
      );
    }

    const allowedSet = new Set(allowedUserIds);
    const notMentionable = parsed.filter((id) => !allowedSet.has(id));
    if (notMentionable.length > 0) {
      throw new BadRequestException(
        `Cannot mention users without ticket access: ${notMentionable.join(', ')}`,
      );
    }

    return parsed;
  }
}
