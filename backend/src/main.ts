// Load .env BEFORE any module imports so that module-level code
// (e.g. ENABLE_WORKERS check in AppModule) can read env vars.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: ['health', 'docs'],
  });

  // CORS
  const corsOrigin = configService.get<string>('corsOrigin') ?? 'http://localhost:8081';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GapWalk API')
    .setDescription('GapWalk micro-walk research platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Health check endpoint (for Docker healthcheck)
  const expressApp = app.getHttpAdapter().getInstance() as {
    get: (
      path: string,
      handler: (
        req: Record<string, unknown>,
        res: { status: (code: number) => { json: (body: unknown) => void } },
      ) => void,
    ) => void;
  };
  expressApp.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`GapWalk API running on port ${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
void bootstrap();
