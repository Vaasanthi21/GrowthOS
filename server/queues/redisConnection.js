import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

connection.on('connect', () => {
  console.log('Redis connected');
});

connection.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});
