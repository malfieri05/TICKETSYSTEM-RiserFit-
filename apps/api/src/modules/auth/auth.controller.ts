import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { RequestUser } from './strategies/jwt.strategy';

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // GET /api/auth/me
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }

  // POST /api/auth/register — create account with email + password
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.name, body.password);
  }

  // POST /api/auth/login — sign in with email + password
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto) {
    return this.authService.loginWithPassword(body.email, body.password);
  }

  // POST /api/auth/dev-login — DEV ONLY, no password required
  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() body: { email: string }) {
    return this.authService.devLogin(body.email);
  }

  // POST /api/auth/sso/callback — called after SSO provider redirects back
  @Public()
  @Post('sso/callback')
  @HttpCode(HttpStatus.OK)
  async ssoCallback(
    @Body() body: { ssoId: string; email: string; name: string },
  ) {
    return this.authService.loginWithSso(body.ssoId, body.email, body.name);
  }
}
