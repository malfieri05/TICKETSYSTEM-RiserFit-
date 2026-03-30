import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
