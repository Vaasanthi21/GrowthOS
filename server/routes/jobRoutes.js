import express from 'express';
import { mockQueue } from '../queues/mockQueue.js';

const router = express.Router();

router.post('/mock', async (req, res) => {
  try {
    const job = await mockQueue.add('mock-delay-job', {
      payload: req.body || {},
      createdAt: new Date().toISOString(),
    });

    return res.status(202).json({
      success: true,
      message: 'Mock job added to queue',
      jobId: job.id,
      statusUrl: `/api/jobs/${job.id}/status`,
    });
  } catch (error) {
    console.error('Failed to create mock job:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create mock job',
      error: error.message,
    });
  }
});

router.get('/:id/status', async (req, res) => {
  try {
    const job = await mockQueue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    const state = await job.getState();

    return res.json({
      success: true,
      jobId: job.id,
      name: job.name,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    });
  } catch (error) {
    console.error('Failed to fetch job status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch job status',
      error: error.message,
    });
  }
});

export default router;