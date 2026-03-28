import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');

/** Normalize origin for comparison (browsers never send a trailing slash on Origin). */
function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, '');
}

/** Split comma-separated env (e.g. prod + Vercel preview URLs). */
function originsFromEnv(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((s) => normalizeOrigin(s.trim()))
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(compression());

  // Global prefix — all routes are /api/... except bare GET / (see RootController)
  app.setGlobalPrefix('api', {
    exclude: [''],
  });

  // CORS — allow frontend dev server (any localhost port) + production domain
  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = new Set<string>([
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002',
    ...originsFromEnv(process.env.FRONTEND_URL),
    ...originsFromEnv(process.env.CORS_EXTRA_ORIGINS),
  ]);
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(normalizeOrigin(origin))) return cb(null, true);
      if (
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
      )
        return cb(null, true);
      // In development, allow any localhost-like origin (e.g. 0.0.0.0, host.docker.internal)
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|[\w-]+\.local)(:\d+)?$/.test(origin))
        return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe — auto-validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true, // Auto-transform types
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log(`🚀 API running at http://localhost:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  console.error('API bootstrap failed:', err);
  process.exit(1);
});
