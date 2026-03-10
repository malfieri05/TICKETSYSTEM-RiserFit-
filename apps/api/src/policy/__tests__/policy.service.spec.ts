import { Test } from '@nestjs/testing';
import { PolicyService } from '../policy.service';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { TICKET_CREATE } from '../capabilities/capability-keys';

describe('PolicyService', () => {
  let service: PolicyService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PermissionsModule],
      providers: [PolicyService],
    }).compile();

    service = moduleRef.get(PolicyService);
  });

  it('allows ticket.create for authenticated users', () => {
    const actor = {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test',
      role: 'STUDIO_USER',
      teamId: null,
      studioId: null,
      marketId: null,
      isActive: true,
      departments: [],
      scopeStudioIds: [],
    } satisfies Parameters<TicketVisibilityService['buildWhereClause']>[0];

    const decision = service.evaluate(TICKET_CREATE, actor, null);
    expect(decision.allowed).toBe(true);
  });
});
