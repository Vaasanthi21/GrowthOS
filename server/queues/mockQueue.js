import { Queue } from 'bullmq';
import { connection } from './redisConnection.js';

export const mockQueue = new Queue('mock-jobs', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 1,
  },
});
