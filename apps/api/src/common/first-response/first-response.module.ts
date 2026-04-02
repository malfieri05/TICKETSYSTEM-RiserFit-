import { Module } from '@nestjs/common';
import { FirstResponseService } from './first-response.service';

@Module({
  providers: [FirstResponseService],
  exports: [FirstResponseService],
})
export class FirstResponseModule {}
