import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilityKey } from '../capabilities/capability-keys';
import { PolicyService } from '../policy.service';
import { POLICY_CAPABILITY_KEY } from './policy.decorator';

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyService: PolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<
      CapabilityKey | undefined
    >(POLICY_CAPABILITY_KEY, [context.getHandler(), context.getClass()]);

    if (!capability) {
      // No capability declared → guard is a no-op.
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resource = request.policyResource ?? null;
    const ctx = request.policyContext ?? undefined;

    const decision = this.policyService.evaluate(
      capability,
      user,
      resource,
      ctx,
    );
    if (!decision.allowed) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
