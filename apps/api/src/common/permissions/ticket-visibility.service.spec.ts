import { ForbiddenException } from '@nestjs/common';
import { TicketVisibilityService } from './ticket-visibility.service';
import { RequestUser } from '../../modules/auth/strategies/jwt.strategy';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'test@test.com',
    displayName: 'Test User',
    role: 'STUDIO_USER',
    teamId: null,
    studioId: 'studio-1',
    marketId: null,
    isActive: true,
    departments: [],
    scopeStudioIds: [],
    ...overrides,
  };
}

function makeTicket(
  overrides: Partial<{
    requesterId: string;
    ownerId: string | null;
    studioId: string | null;
    owner: { teamId: string | null; team?: { name: string } | null } | null;
  }> = {},
) {
  return {
    requesterId: 'other-user',
    ownerId: null,
    studioId: 'studio-1',
    owner: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TicketVisibilityService', () => {
  let service: TicketVisibilityService;

  beforeEach(() => {
    service = new TicketVisibilityService();
  });

  // ── buildWhereClause ──────────────────────────────────────────────────────

  describe('buildWhereClause', () => {
    it('ADMIN returns empty object (no restriction)', () => {
      const actor = makeActor({ role: 'ADMIN' });
      expect(service.buildWhereClause(actor)).toEqual({});
    });

    it('STUDIO_USER with primary studio returns OR with requesterId and studioId', () => {
      const actor = makeActor({ role: 'STUDIO_USER', studioId: 'studio-A' });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([
          { requesterId: 'user-1' },
          { studioId: { in: ['studio-A'] } },
        ]),
      });
    });

    it('STUDIO_USER with no studio returns only requesterId condition', () => {
      const actor = makeActor({ role: 'STUDIO_USER', studioId: null });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({ OR: [{ requesterId: 'user-1' }] });
    });

    it('STUDIO_USER includes scope override studios', () => {
      const actor = makeActor({
        role: 'STUDIO_USER',
        studioId: 'studio-A',
        scopeStudioIds: ['studio-B', 'studio-C'],
      });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([
          { studioId: { in: ['studio-A', 'studio-B', 'studio-C'] } },
        ]),
      });
    });

    it('DEPARTMENT_USER returns ownerId condition for self', () => {
      const actor = makeActor({ role: 'DEPARTMENT_USER', departments: [] });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([{ ownerId: 'user-1' }]),
      });
    });

    it('DEPARTMENT_USER with departments includes team name condition', () => {
      const actor = makeActor({ role: 'DEPARTMENT_USER', departments: ['HR'] });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([
          { owner: { team: { name: { in: ['HR'] } } } },
        ]),
      });
    });

    it('DEPARTMENT_USER maps OPERATIONS to "Operations" team name', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        departments: ['OPERATIONS'],
      });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([
          { owner: { team: { name: { in: ['Operations'] } } } },
        ]),
      });
    });

    it('DEPARTMENT_USER maps MARKETING to "Marketing" team name', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        departments: ['MARKETING'],
      });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([
          { owner: { team: { name: { in: ['Marketing'] } } } },
        ]),
      });
    });

    it('DEPARTMENT_USER with scope studio override includes studio condition', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        departments: ['HR'],
        scopeStudioIds: ['studio-X'],
      });
      const where = service.buildWhereClause(actor);
      expect(where).toMatchObject({
        OR: expect.arrayContaining([{ studioId: { in: ['studio-X'] } }]),
      });
    });
  });

  // ── assertCanView ─────────────────────────────────────────────────────────

  describe('assertCanView', () => {
    it('ADMIN can view any ticket', () => {
      const actor = makeActor({ role: 'ADMIN' });
      expect(() =>
        service.assertCanView(
          makeTicket({ requesterId: 'stranger', studioId: 'other' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('STUDIO_USER can view their own submitted ticket', () => {
      const actor = makeActor({
        role: 'STUDIO_USER',
        id: 'user-1',
        studioId: null,
      });
      expect(() =>
        service.assertCanView(
          makeTicket({ requesterId: 'user-1', studioId: 'other' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('STUDIO_USER can view a ticket from their primary studio', () => {
      const actor = makeActor({ role: 'STUDIO_USER', studioId: 'studio-1' });
      expect(() =>
        service.assertCanView(
          makeTicket({ requesterId: 'other', studioId: 'studio-1' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('STUDIO_USER can view a ticket from a scope-override studio', () => {
      const actor = makeActor({
        role: 'STUDIO_USER',
        studioId: null,
        scopeStudioIds: ['studio-X'],
      });
      expect(() =>
        service.assertCanView(
          makeTicket({ requesterId: 'other', studioId: 'studio-X' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('STUDIO_USER throws ForbiddenException for out-of-scope ticket', () => {
      const actor = makeActor({
        role: 'STUDIO_USER',
        studioId: 'studio-1',
        scopeStudioIds: [],
      });
      expect(() =>
        service.assertCanView(
          makeTicket({ requesterId: 'other', studioId: 'studio-2' }),
          actor,
        ),
      ).toThrow(ForbiddenException);
    });

    it('DEPARTMENT_USER can view a ticket assigned to them', () => {
      const actor = makeActor({ role: 'DEPARTMENT_USER', id: 'user-1' });
      expect(() =>
        service.assertCanView(
          makeTicket({ ownerId: 'user-1', studioId: 'other' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('DEPARTMENT_USER with scope override can view studio ticket', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        scopeStudioIds: ['studio-Y'],
      });
      expect(() =>
        service.assertCanView(
          makeTicket({ ownerId: null, studioId: 'studio-Y' }),
          actor,
        ),
      ).not.toThrow();
    });

    it('DEPARTMENT_USER throws ForbiddenException for unrelated ticket', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        id: 'user-1',
        scopeStudioIds: [],
      });
      expect(() =>
        service.assertCanView(
          makeTicket({
            requesterId: 'other',
            ownerId: 'other',
            studioId: 'studio-Z',
          }),
          actor,
        ),
      ).toThrow(ForbiddenException);
    });

    it('DEPARTMENT_USER can view ticket owned by teammate in same department', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        id: 'user-1',
        departments: ['HR'],
        scopeStudioIds: [],
      });
      const ticket = makeTicket({
        ownerId: 'teammate-id',
        studioId: 'other-studio',
        owner: { teamId: 'team-1', team: { name: 'HR' } },
      });
      expect(() => service.assertCanView(ticket, actor)).not.toThrow();
    });

    it('DEPARTMENT_USER cannot view ticket when owner is in different department', () => {
      const actor = makeActor({
        role: 'DEPARTMENT_USER',
        id: 'user-1',
        departments: ['HR'],
        scopeStudioIds: [],
      });
      const ticket = makeTicket({
        ownerId: 'other-user',
        studioId: 'other-studio',
        owner: { teamId: 'team-2', team: { name: 'Marketing' } },
      });
      expect(() => service.assertCanView(ticket, actor)).toThrow(
        ForbiddenException,
      );
    });
  });

  // ── canModify / assertCanModify ───────────────────────────────────────────

  describe('canModify', () => {
    it('ADMIN can always modify', () => {
      const actor = makeActor({ role: 'ADMIN' });
      expect(service.canModify({ requesterId: 'x', ownerId: 'y' }, actor)).toBe(
        true,
      );
    });

    it('DEPARTMENT_USER who owns the ticket can modify', () => {
      const actor = makeActor({ role: 'DEPARTMENT_USER', id: 'user-1' });
      expect(
        service.canModify({ requesterId: 'x', ownerId: 'user-1' }, actor),
      ).toBe(true);
    });

    it('DEPARTMENT_USER who does not own the ticket cannot modify', () => {
      const actor = makeActor({ role: 'DEPARTMENT_USER', id: 'user-1' });
      expect(
        service.canModify({ requesterId: 'x', ownerId: 'user-2' }, actor),
      ).toBe(false);
    });

    it('STUDIO_USER who submitted the ticket can modify', () => {
      const actor = makeActor({ role: 'STUDIO_USER', id: 'user-1' });
      expect(
        service.canModify({ requesterId: 'user-1', ownerId: null }, actor),
      ).toBe(true);
    });

    it('STUDIO_USER who did not submit the ticket cannot modify', () => {
      const actor = makeActor({ role: 'STUDIO_USER', id: 'user-1' });
      expect(
        service.canModify({ requesterId: 'other', ownerId: 'user-1' }, actor),
      ).toBe(false);
    });
  });

  describe('assertCanModify', () => {
    it('throws ForbiddenException when canModify is false', () => {
      const actor = makeActor({ role: 'STUDIO_USER', id: 'user-1' });
      expect(() =>
        service.assertCanModify({ requesterId: 'other', ownerId: null }, actor),
      ).toThrow(ForbiddenException);
    });

    it('does not throw when canModify is true', () => {
      const actor = makeActor({ role: 'STUDIO_USER', id: 'user-1' });
      expect(() =>
        service.assertCanModify(
          { requesterId: 'user-1', ownerId: null },
          actor,
        ),
      ).not.toThrow();
    });
  });
});
