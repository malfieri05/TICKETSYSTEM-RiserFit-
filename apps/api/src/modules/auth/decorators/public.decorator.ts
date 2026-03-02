import { SetMetadata } from '@nestjs/common';

// Use @Public() on any route that should skip JWT auth
// e.g. @Public() on the /auth/login endpoint
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
