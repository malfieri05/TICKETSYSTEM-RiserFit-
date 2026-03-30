import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, InvitationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Controller('admin/invitations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class InvitationsAdminController {
  constructor(private invitations: InvitationsService) {}

  @Post()
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invitations.create(dto, user.id);
  }

  @Get()
  list(
    @Query('status') status?: InvitationStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.invitations.listForAdmin({
      status,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Post(':id/resend')
  resend(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.invitations.resend(id, user.id);
  }

  @Post(':id/regenerate')
  regenerate(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.invitations.regenerate(id, user.id);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.invitations.revoke(id, user.id);
  }
}
