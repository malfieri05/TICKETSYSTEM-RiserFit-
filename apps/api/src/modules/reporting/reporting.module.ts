import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { DatabaseModule } from '../../common/database/database.module';
import { PermissionsModule } from '../../common/permissions/permissions.module';

@Module({
  imports: [DatabaseModule, PermissionsModule],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
