import { BadRequestException } from '@nestjs/common';
import { MentionParserService } from './mention-parser.service';
import { PrismaService } from '../../common/database/prisma.service';

describe('MentionParserService', () => {
  let service: MentionParserService;
  let prisma: { user: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
    } as never;
    service = new MentionParserService(prisma as never);
  });

  describe('parseStructuredMentions', () => {
    it('extracts unique userIds from @[Name](userId) pattern', () => {
      const body = 'Hi @[Alice](user-1) and @[Bob](user-2) and @[Alice](user-1) again.';
      expect(service.parseStructuredMentions(body)).toEqual(['user-1', 'user-2']);
    });

    it('returns empty array when no mentions', () => {
      expect(service.parseStructuredMentions('No mentions here.')).toEqual([]);
    });
  });

  describe('extractMentionsForTicket', () => {
    it('returns empty array when body has no mentions', async () => {
      const result = await service.extractMentionsForTicket('Hello world', ['user-1']);
      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('throws 400 when a mentioned user does not exist or is inactive', async () => {
      const body = 'Hey @[Ghost](non-existent-id)';
      prisma.user.findMany.mockResolvedValue([]); // no users found

      await expect(
        service.extractMentionsForTicket(body, ['some-allowed-id']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.extractMentionsForTicket(body, ['some-allowed-id']),
      ).rejects.toThrow(/do not exist or are inactive/);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['non-existent-id'] }, isActive: true },
        select: { id: true },
      });
    });

    it('throws 400 when a mentioned user exists but is not in allowed set', async () => {
      const body = 'Hey @[Bob](user-2)';
      prisma.user.findMany.mockResolvedValue([{ id: 'user-2' }]);
      // allowed set only has user-1, not user-2

      await expect(
        service.extractMentionsForTicket(body, ['user-1']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.extractMentionsForTicket(body, ['user-1']),
      ).rejects.toThrow(/without ticket access/);
    });

    it('returns parsed ids when all mentioned users exist and are in allowed set', async () => {
      const body = 'Hi @[Alice](user-1) and @[Bob](user-2)';
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

      const result = await service.extractMentionsForTicket(body, ['user-1', 'user-2']);

      expect(result).toEqual(['user-1', 'user-2']);
    });
  });
});
