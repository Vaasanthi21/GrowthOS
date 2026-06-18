import { Worker } from 'bullmq';
import { connection } from './redisConnection.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockWorker = new Worker(
  'mock-jobs',
  async (job) => {
    console.log(`Processing mock job ${job.id}`);

    await job.updateProgress(50);
    await wait(10000);
    await job.updateProgress(100);

    return {
      message: 'Mock job completed successfully',
      jobId: job.id,
      input: job.data,
      completedAt: new Date().toISOString(),
    };
  },
  { connection }
);

mockWorker.on('completed', (job) => {
  console.log(`Mock job ${job.id} completed`);
});

mockWorker.on('failed', (job, error) => {
  console.error(`Mock job ${job?.id} failed:`, error.message);
});
