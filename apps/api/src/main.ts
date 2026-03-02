import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix — all routes are /api/...
  app.setGlobalPrefix('api');

  // CORS — allow frontend dev server + production domain
  app.enableCors({
    origin: [
      'http://localhost:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });

  // Global validation pipe — auto-validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true,        // Auto-transform types
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  console.log(`🚀 API running at http://localhost:${port}/api`);
}

bootstrap();
