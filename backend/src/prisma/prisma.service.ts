import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPostgresDriverAdapter } from './postgres-driver-adapter';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isTest = process.env.NODE_ENV === 'test';
    const fallbackTestUrl =
      'postgresql://test:test@localhost:5432/test?schema=public';

    if (isTest && !process.env.DATABASE_URL) {
      // Keep test app boot deterministic even when no DB is configured.
      process.env.DATABASE_URL = fallbackTestUrl;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required to initialize PrismaService.');
    }

    super({
      adapter: createPostgresDriverAdapter(databaseUrl) as never,
    });
  }

  async onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.PRISMA_CONNECT_IN_TEST !== 'true'
    ) {
      this.logger.warn(
        'Skipping Prisma connection in test mode (set PRISMA_CONNECT_IN_TEST=true to enable).',
      );
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
