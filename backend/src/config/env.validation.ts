import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  development = 'development',
  production = 'production',
  test = 'test',
}

/**
 * Schema for the environment variables the app depends on. Validated once at
 * startup so the process fails fast with a clear message instead of crashing
 * later with an obscure error (or silently using a missing secret).
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  // Firebase Admin: either FIREBASE_SERVICE_ACCOUNT_JSON, or the three
  // individual fields below. Enforced in the refinement at the bottom.
  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;

  @IsOptional()
  @IsString()
  FIREBASE_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FIREBASE_CLIENT_EMAIL?: string;

  @IsOptional()
  @IsString()
  FIREBASE_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  EXPO_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  SWAGGER_ENABLED?: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  // Tests boot without a real environment; PrismaService already provides its
  // own fallbacks, so skip strict validation there.
  if (config.NODE_ENV === 'test') {
    return config as unknown as EnvironmentVariables;
  }

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const hasServiceAccount = !!validated.FIREBASE_SERVICE_ACCOUNT_JSON;
  const hasIndividualCreds =
    !!validated.FIREBASE_PROJECT_ID &&
    !!validated.FIREBASE_CLIENT_EMAIL &&
    !!validated.FIREBASE_PRIVATE_KEY;

  if (!hasServiceAccount && !hasIndividualCreds) {
    throw new Error(
      'Invalid environment configuration: Firebase Admin credentials are required. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_JSON, or all of FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.',
    );
  }

  return validated;
}
