import { Module } from '@nestjs/common';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PolicyService } from './policy.service';

@Module({
  imports: [PermissionsModule],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
