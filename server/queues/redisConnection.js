import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: false,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) {
      return null; // Stop retrying if Redis is not running locally
    }
    return 5000;
  }
});

connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (error) => {
  // Gracefully log warning instead of crashing
  console.warn('[REDIS WARN]', error.message);
});
