import { apiClient, tokenStorage } from '@/api/apiClient';

/**
 * Start async image generation (returns job ID)
 * @param {Object} params - Generation parameters (must include 'topic')
 * @returns {Promise<Object>} Job ID and status
 */
export async function startAsyncImageGeneration(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  const response = await apiClient.post('/generate-image', { 
    topic: params?.topic || '',
    platform: params?.platform || null,
    aspectRatio: params?.aspectRatio || null,
    style: params?.style || null,
    companyPersona: params?.companyPersona || null,
    logoPlacement: params?.logoPlacement || null,
    logo_placement: params?.logo_placement || null,
    async: true 
  }, token);
  
  return {
    jobId: response.jobId || response.id || response.job_id,
    status: response.status || 'queued',
    imageUrl: response.imageUrl || response.image_url || null
  };
}

/**
 * Start async video generation (returns job ID)
 * @param {Object} params - Generation parameters (must include 'topic')
 * @returns {Promise<Object>} Job ID and status
 */
export async function startAsyncVideoGeneration(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  const response = await apiClient.post('/generate-video', { 
    topic: params?.topic || '', 
    async: true 
  }, token);
  
  return {
    jobId: response.jobId || response.id,
    status: response.status || 'queued'
  };
}

/**
 * Poll image generation status
 * @param {string} jobId - Job ID from startAsyncImageGeneration
 * @returns {Promise<Object>} Generation status
 */
export async function pollImageStatus(jobId) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get(`/generate-image/${encodeURIComponent(jobId)}/status`, token);
}

/**
 * Poll video generation status
 * @param {string} jobId - Job ID from startAsyncVideoGeneration
 * @returns {Promise<Object>} Generation status
 */
export async function pollVideoStatus(jobId) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get(`/video-status/${encodeURIComponent(jobId)}`, token);
}

/**
 * Create a polling interval that checks status repeatedly
 * @param {string} jobId - Job ID
 * @param {string} contentType - 'image' or 'video'
 * @param {Function} onUpdate - Callback for status updates
 * @param {Function} onComplete - Callback for completion
 * @param {number} intervalMS - Polling interval (default: 3000ms)
 * @returns {Object} Control object with stop function
 */
export function createGenerationPoller(jobId, contentType, onUpdate, onComplete, intervalMS = 3000) {
  let intervalId = null;
  let isStopped = false;

  // Choose the right poll function based on content type
  const pollStatus = contentType === 'video' ? pollVideoStatus : pollImageStatus;

  const poll = async () => {
    try {
      const status = await pollStatus(jobId);
      onUpdate(status);

      if (status.status === 'completed' || status.status === 'failed') {
        stop();
        onComplete(status);
      }
    } catch (error) {
      console.error('Polling error:', error);
      if (!isStopped) {
        stop();
        onComplete({ status: 'failed', error: error.message });
      }
    }
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isStopped = true;
  };

  const start = () => {
    if (!intervalId) {
      intervalId = setInterval(poll, intervalMS);
      poll(); // Immediate first poll
    }
  };

  start();

  return { stop, start };
}