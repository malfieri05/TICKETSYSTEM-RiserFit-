import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(compression());

  // Global prefix — all routes are /api/...
  app.setGlobalPrefix('api');

  // CORS — allow frontend dev server (any localhost port) + production domain
  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002',
    process.env.FRONTEND_URL,
  ].filter(Boolean);
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
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
