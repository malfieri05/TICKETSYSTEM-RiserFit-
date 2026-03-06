import { Global, Module } from '@nestjs/common';
import { UserCacheService } from './user-cache.service';
import { MySummaryCacheService } from './my-summary-cache.service';

@Global()
@Module({
  providers: [UserCacheService, MySummaryCacheService],
  exports: [UserCacheService, MySummaryCacheService],
})
export class CacheModule {}
