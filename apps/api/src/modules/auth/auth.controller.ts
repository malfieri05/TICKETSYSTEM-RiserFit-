import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { RequestUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // GET /api/auth/me — returns the currently authenticated user
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return user;
  }

  // POST /api/auth/dev-login — DEV ONLY, disabled in production
  // Body: { email: string }
  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() body: { email: string }) {
    return this.authService.devLogin(body.email);
  }

  // POST /api/auth/sso/callback — called after SSO provider redirects back
  // Body: { ssoId, email, name } (populated by OIDC strategy once SSO is configured)
  @Public()
  @Post('sso/callback')
  @HttpCode(HttpStatus.OK)
  async ssoCallback(@Body() body: { ssoId: string; email: string; name: string }) {
    return this.authService.loginWithSso(body.ssoId, body.email, body.name);
  }
}
