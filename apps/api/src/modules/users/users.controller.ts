import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // GET /api/users — list all active users (agents/managers/admins)
  @Roles(Role.AGENT, Role.MANAGER, Role.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // GET /api/users/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // PATCH /api/users/:id/role — Admin only
  @Roles(Role.ADMIN)
  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() body: { role: Role },
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.updateRole(id, body.role, user);
  }

  // PATCH /api/users/:id/deactivate — Admin only
  @Roles(Role.ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.deactivate(id, user);
  }
}
