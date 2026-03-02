import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { IngestionService } from './ingestion.service';
import { AiController } from './ai.controller';

@Module({
  // PrismaService is @Global() — no need to import DatabaseModule here
  controllers: [AiController],
  providers: [AiService, IngestionService],
  exports: [AiService, IngestionService],
})
export class AiModule {}
