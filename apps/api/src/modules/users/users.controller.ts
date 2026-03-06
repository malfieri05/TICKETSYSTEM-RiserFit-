import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, Department } from '@prisma/client';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // GET /api/users — list all active users (DEPARTMENT_USER and above)
  @Roles(Role.DEPARTMENT_USER, Role.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // GET /api/users/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // PATCH /api/users/:id/role — ADMIN only
  @Roles(Role.ADMIN)
  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() body: { role: Role },
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.updateRole(id, body.role, user);
  }

  // PATCH /api/users/:id/deactivate — ADMIN only
  @Roles(Role.ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.deactivate(id, user);
  }

  // ─── Department management (ADMIN only) ─────────────────────────────────────

  // GET /api/users/:id/departments
  @Roles(Role.ADMIN)
  @Get(':id/departments')
  listDepartments(@Param('id') id: string) {
    return this.usersService.listDepartments(id);
  }

  // PUT /api/users/:id/departments — replaces the full set of department assignments
  @Roles(Role.ADMIN)
  @Patch(':id/departments')
  setDepartments(
    @Param('id') id: string,
    @Body() body: { departments: Department[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.setDepartments(id, body.departments, user);
  }

  // ─── Studio scope overrides (ADMIN only) ─────────────────────────────────────

  // GET /api/users/:id/studio-scopes
  @Roles(Role.ADMIN)
  @Get(':id/studio-scopes')
  listStudioScopes(@Param('id') id: string) {
    return this.usersService.listStudioScopes(id);
  }

  // POST /api/users/:id/studio-scopes — grant a studio scope override
  @Roles(Role.ADMIN)
  @Post(':id/studio-scopes')
  addStudioScope(
    @Param('id') id: string,
    @Body() body: { studioId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.addStudioScope(id, body.studioId, user);
  }

  // DELETE /api/users/:id/studio-scopes/:studioId — revoke a studio scope override
  @Roles(Role.ADMIN)
  @Delete(':id/studio-scopes/:studioId')
  @HttpCode(HttpStatus.OK)
  removeStudioScope(
    @Param('id') id: string,
    @Param('studioId') studioId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.removeStudioScope(id, studioId, user);
  }
}
