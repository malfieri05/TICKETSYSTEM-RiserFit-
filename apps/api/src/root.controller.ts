import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator';

/**
 * Served at GET / (excluded from global /api prefix) so bare deployment URLs
 * are friendly in browsers instead of Nest’s default “Cannot GET /”.
 */
@Controller()
export class RootController {
  @Get()
  @Public()
  root() {
    return {
      service: 'Ticketing API',
      apiPrefix: '/api',
      health: '/api/health',
    };
  }
}
