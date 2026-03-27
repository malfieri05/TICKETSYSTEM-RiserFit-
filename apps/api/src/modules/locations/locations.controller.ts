import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get(':studioId/profile')
  @Roles()
  getProfile(
    @Param('studioId') studioId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.locationsService.getProfile(studioId, user);
  }
}
