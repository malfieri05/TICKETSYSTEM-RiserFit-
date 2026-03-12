import { BadRequestException } from '@nestjs/common';
import { SubtaskWorkflowService } from './subtask-workflow.service';

function buildPrismaMock() {
  return {
    ticketClass: { findUnique: jest.fn() },
    subtaskWorkflowTemplate: { findFirst: jest.fn() },
    subtaskTemplate: { findMany: jest.fn() },
    subtaskTemplateDependency: { findMany: jest.fn(), create: jest.fn() },
    subtask: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    subtaskDependency: { findMany: jest.fn(), create: jest.fn() },
  };
}

function buildTxMock() {
  return {
    subtaskDependency: { findMany: jest.fn() },
    subtask: { findMany: jest.fn(), update: jest.fn() },
  };
}

describe('SubtaskWorkflowService', () => {
  let service: SubtaskWorkflowService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new SubtaskWorkflowService(prisma as never);
  });

  describe('wouldCreateCycle', () => {
    it('returns true when subtaskTemplateId === dependsOnSubtaskTemplateId', async () => {
      const result = await service.wouldCreateCycle('w1', 't1', 't1');
      expect(result).toBe(true);
    });

    it('returns true when adding edge would create cycle A→B→A', async () => {
      prisma.subtaskTemplate.findMany.mockResolvedValue([
        { id: 't1' },
        { id: 't2' },
      ]);
      prisma.subtaskTemplateDependency.findMany.mockResolvedValue([
        { subtaskTemplateId: 't2', dependsOnSubtaskTemplateId: 't1' },
      ]);
      const result = await service.wouldCreateCycle('w1', 't1', 't2');
      expect(result).toBe(true);
    });

    it('returns true when adding C→A in chain A→B→C creates cycle (t1→t2→t3, add t3→t1)', async () => {
      prisma.subtaskTemplate.findMany.mockResolvedValue([
        { id: 't1' },
        { id: 't2' },
        { id: 't3' },
      ]);
      prisma.subtaskTemplateDependency.findMany.mockResolvedValue([
        { subtaskTemplateId: 't1', dependsOnSubtaskTemplateId: 't2' },
        { subtaskTemplateId: 't2', dependsOnSubtaskTemplateId: 't3' },
      ]);
      const result = await service.wouldCreateCycle('w1', 't3', 't1');
      expect(result).toBe(true);
    });
  });

  describe('addTemplateDependency', () => {
    it('throws when subtaskTemplateId === dependsOnSubtaskTemplateId', async () => {
      await expect(
        service.addTemplateDependency('w1', 't1', 't1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addTemplateDependency('w1', 't1', 't1'),
      ).rejects.toThrow(/cannot depend on itself/);
    });

    it('throws when would create cycle', async () => {
      prisma.subtaskTemplate.findMany.mockResolvedValue([
        { id: 't1' },
        { id: 't2' },
      ]);
      prisma.subtaskTemplateDependency.findMany.mockResolvedValue([
        { subtaskTemplateId: 't2', dependsOnSubtaskTemplateId: 't1' },
      ]);
      prisma.subtaskTemplateDependency.create.mockResolvedValue({});
      await expect(
        service.addTemplateDependency('w1', 't1', 't2'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.addTemplateDependency('w1', 't1', 't2'),
      ).rejects.toThrow(/cycle/);
    });
  });

  describe('unlockDownstreamIfSatisfied', () => {
    it('sets downstream to READY with availableAt and returns their IDs when all deps satisfied', async () => {
      const tx = buildTxMock();
      tx.subtaskDependency.findMany
        .mockResolvedValueOnce([{ subtaskId: 'sub-b' }])
        .mockResolvedValueOnce([{ dependsOnSubtaskId: 'sub-a' }]);
      tx.subtask.findMany.mockResolvedValue([{ status: 'DONE' }]);
      tx.subtask.update.mockResolvedValue({});

      const result = await service.unlockDownstreamIfSatisfied(
        tx as never,
        'sub-a',
      );

      expect(result).toEqual(['sub-b']);
      expect(tx.subtask.update).toHaveBeenCalledWith({
        where: { id: 'sub-b' },
        data: { status: 'READY', availableAt: expect.any(Date) },
      });
    });

    it('returns empty when downstream still has unsatisfied deps', async () => {
      const tx = buildTxMock();
      tx.subtaskDependency.findMany
        .mockResolvedValueOnce([{ subtaskId: 'sub-b' }])
        .mockResolvedValueOnce([
          { dependsOnSubtaskId: 'sub-a' },
          { dependsOnSubtaskId: 'sub-c' },
        ]);
      tx.subtask.findMany.mockResolvedValue([
        { status: 'DONE' },
        { status: 'LOCKED' },
      ]);

      const result = await service.unlockDownstreamIfSatisfied(
        tx as never,
        'sub-a',
      );

      expect(result).toEqual([]);
      expect(tx.subtask.update).not.toHaveBeenCalled();
    });
  });
});
