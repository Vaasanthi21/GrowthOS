import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Retry once every 60 seconds to avoid flooding the console with connection errors
    return 60000;
  }
});

connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});
