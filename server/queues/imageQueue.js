import { Queue } from 'bullmq';
import { connection } from './redisConnection.js';

export const imageQueue = new Queue('image-generation-jobs', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 1,
  },
});