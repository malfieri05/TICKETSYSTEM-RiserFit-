import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { InvitationsService } from './invitations.service';
import { ValidateInvitationDto } from './dto/validate-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Controller('invitations')
export class InvitationsPublicController {
  constructor(private invitations: InvitationsService) {}

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() body: ValidateInvitationDto) {
    return this.invitations.validateToken(body.token);
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  async accept(@Body() body: AcceptInvitationDto) {
    return this.invitations.accept(body.token, body.password);
  }
}
