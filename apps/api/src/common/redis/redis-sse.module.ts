import { Global, Module } from '@nestjs/common';
import { SsePubSubService } from './sse-pubsub.service';

@Global()
@Module({
  providers: [SsePubSubService],
  exports: [SsePubSubService],
})
export class RedisSseModule {}
