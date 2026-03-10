import { SetMetadata } from '@nestjs/common';
import { CapabilityKey } from '../capabilities/capability-keys';

export const POLICY_CAPABILITY_KEY = 'policy:capability';

export const PolicyCapability = (capability: CapabilityKey) =>
  SetMetadata(POLICY_CAPABILITY_KEY, capability);
