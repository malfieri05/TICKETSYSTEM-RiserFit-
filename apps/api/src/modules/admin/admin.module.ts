import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../../common/database/database.module';
import { PolicyModule } from '../../policy/policy.module';

@Module({
  imports: [DatabaseModule, PolicyModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
