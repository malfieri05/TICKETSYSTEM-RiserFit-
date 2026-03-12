import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DatabaseModule } from '../../common/database/database.module';
import { PermissionsModule } from '../../common/permissions/permissions.module';

@Module({
  imports: [DatabaseModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
