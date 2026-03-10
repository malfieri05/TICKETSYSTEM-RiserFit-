import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

// ─── Mock factories ──────────────────────────────────────────────────────────

function makeAdmin(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'admin-1',
    email: 'admin@test.com',
    displayName: 'Admin',
    role: 'ADMIN',
    teamId: null,
    studioId: null,
    marketId: null,
    isActive: true,
    departments: [],
    scopeStudioIds: [],
    ...overrides,
  };
}

function makeDeptUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'dept-1',
    email: 'dept@test.com',
    displayName: 'Dept User',
    role: 'DEPARTMENT_USER',
    teamId: null,
    studioId: null,
    marketId: null,
    isActive: true,
    departments: ['HR'],
    scopeStudioIds: [],
    ...overrides,
  };
}

// ─── Prisma mock ─────────────────────────────────────────────────────────────

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation((args: { where: { id: string } }) =>
          Promise.resolve({
            id: args.where.id,
            email: 'u@test.com',
            name: 'User',
            role: 'STUDIO_USER',
          }),
        ),
      update: jest.fn(),
    },
    studio: {
      findUnique: jest.fn(),
    },
    userDepartment: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    userStudioScope: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

function buildCacheMock() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cache: ReturnType<typeof buildCacheMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    cache = buildCacheMock();
    service = new UsersService(prisma as never, cache as never);
  });

  // ── updateRole ───────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('throws ForbiddenException when caller is not ADMIN', async () => {
      const caller = makeDeptUser();
      await expect(
        service.updateRole('user-2', 'DEPARTMENT_USER', caller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('invalidates cache after role update', async () => {
      const admin = makeAdmin();
      prisma.user.update.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      await service.updateRole('user-2', 'STUDIO_USER', admin);
      expect(cache.invalidate).toHaveBeenCalledWith('user-2');
    });
  });

  // ── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('throws ForbiddenException when caller is not ADMIN', async () => {
      const caller = makeDeptUser();
      await expect(service.deactivate('user-2', caller)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('invalidates cache after deactivation', async () => {
      const admin = makeAdmin();
      prisma.user.update.mockResolvedValue({ id: 'user-2', isActive: false });
      await service.deactivate('user-2', admin);
      expect(cache.invalidate).toHaveBeenCalledWith('user-2');
    });
  });

  // ── setDepartments ────────────────────────────────────────────────────────

  describe('setDepartments', () => {
    it('throws ForbiddenException when caller is not ADMIN', async () => {
      const caller = makeDeptUser();
      await expect(
        service.setDepartments('user-2', ['HR'], caller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when target is not a DEPARTMENT_USER', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      await expect(
        service.setDepartments('user-2', ['HR'], admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when departments array is empty', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'DEPARTMENT_USER',
      });
      await expect(service.setDepartments('user-2', [], admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('replaces departments and invalidates cache', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'DEPARTMENT_USER',
      });
      prisma.userDepartment.findMany.mockResolvedValue([
        { department: 'HR', assignedAt: new Date() },
      ]);

      await service.setDepartments('user-2', ['HR', 'OPERATIONS'], admin);

      expect(prisma.userDepartment.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2' },
      });
      expect(prisma.userDepartment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-2', department: 'HR' }),
            expect.objectContaining({
              userId: 'user-2',
              department: 'OPERATIONS',
            }),
          ]),
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledWith('user-2');
    });

    it('throws NotFoundException when user does not exist', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.setDepartments('ghost', ['HR'], admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── addStudioScope ────────────────────────────────────────────────────────

  describe('addStudioScope', () => {
    it('throws ForbiddenException when caller is not ADMIN', async () => {
      const caller = makeDeptUser();
      await expect(
        service.addStudioScope('user-2', 'studio-1', caller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when studio does not exist', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      prisma.studio.findUnique.mockResolvedValue(null);
      await expect(
        service.addStudioScope('user-2', 'ghost-studio', admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts scope and invalidates cache (idempotent)', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      prisma.studio.findUnique.mockResolvedValue({ id: 'studio-1' });

      await service.addStudioScope('user-2', 'studio-1', admin);

      expect(prisma.userStudioScope.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_studioId: { userId: 'user-2', studioId: 'studio-1' },
          },
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledWith('user-2');
    });
  });

  // ── removeStudioScope ─────────────────────────────────────────────────────

  describe('removeStudioScope', () => {
    it('throws ForbiddenException when caller is not ADMIN', async () => {
      const caller = makeDeptUser();
      await expect(
        service.removeStudioScope('user-2', 'studio-1', caller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is a no-op when scope does not exist (does not throw)', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      prisma.userStudioScope.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeStudioScope('user-2', 'nonexistent', admin),
      ).resolves.not.toThrow();
    });

    it('deletes scope and invalidates cache', async () => {
      const admin = makeAdmin();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'STUDIO_USER',
      });
      prisma.userStudioScope.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeStudioScope('user-2', 'studio-1', admin);

      expect(prisma.userStudioScope.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2', studioId: 'studio-1' },
      });
      expect(cache.invalidate).toHaveBeenCalledWith('user-2');
    });
  });
});
