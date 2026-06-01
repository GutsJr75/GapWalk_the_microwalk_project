// Load .env BEFORE any module imports so that module-level code
// (e.g. ENABLE_WORKERS check in AppModule) can read env vars.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('nodeEnv') ?? 'development';
  const swaggerFlag = (configService.get<string>('swaggerEnabled') ?? '')
    .trim()
    .toLowerCase();
  const enableSwagger =
    swaggerFlag === 'true' || (nodeEnv !== 'production' && swaggerFlag !== 'false');

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();
  // Requests arrive through Caddy in production. Trust one proxy hop so
  // req.ip and req.secure are derived from X-Forwarded-* correctly.
  app.set('trust proxy', 1);
  app.use(helmet());

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
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger docs
  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GapWalk API')
      .setDescription('GapWalk micro-walk app backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger docs enabled at /docs');
  } else {
    logger.log('Swagger docs disabled in this environment');
  }

  // GET /health is served by HealthModule's controller (reports DB + Redis
  // connectivity, returns 503 when a dependency is down). It is excluded from
  // the global 'api' prefix above and skips throttling/auth.

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`GapWalk API running on port ${port}`);
  if (enableSwagger) {
    logger.log(`Swagger docs at http://localhost:${port}/docs`);
  }
}
void bootstrap();
