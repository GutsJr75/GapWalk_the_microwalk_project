export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:8081',
  swaggerEnabled: process.env.SWAGGER_ENABLED ?? '',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  },

  expo: {
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  },

  rateLimit: {
    ttlMs: parseInt(process.env.RATE_LIMIT_TTL_MS ?? '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
    blockDurationMs: parseInt(
      process.env.RATE_LIMIT_BLOCK_DURATION_MS ?? '60000',
      10,
    ),
  },
});
