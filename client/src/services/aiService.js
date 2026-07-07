import { apiClient, tokenStorage } from '@/api/apiClient';

/**
 * Generate content variants using AI
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - The system/user prompt
 * @returns {Promise<Array>} Array of content variants
 */
export async function generateContent(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  const safePrompt = params?.prompt ? params.prompt.slice(0, 7500) : '';
  const response = await apiClient.post('/generate-text', { prompt: safePrompt }, token);
  const variants = Array.isArray(response?.variants) ? response.variants : [];
  if (variants.length === 0) {
    throw new Error('No content generated from AI');
  }

  return variants;
}

export async function generateImageAsset(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/generate-image', params, token);
}

export async function startImageGeneration(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/generate-image', { ...params, async: true }, token);
}

export async function fetchImageGenerationStatus(jobId) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get(`/generate-image/${encodeURIComponent(jobId)}/status`, token);
}

export async function generateVideoAsset(params) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/generate-video', params, token);
}

export async function fetchVideoStatus(videoId) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get(`/video-status/${encodeURIComponent(videoId)}`, token);
}

export async function fetchCreditBalance() {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get('/credits/balance', token);
}

export async function fetchKnowledgeSources() {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get('/knowledge-sources', token);
}

export async function createKnowledgeSource(payload) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/knowledge-sources', payload, token);
}

export async function ingestKnowledgeSourceFromUrl(payload) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/knowledge-sources/ingest-url', payload, token);
}

export async function ingestKnowledgeSourceFromFile(payload) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append('fileName', payload.fileName || payload.file?.name || 'attachment');
  formData.append('title', payload.title || payload.fileName || payload.file?.name || 'attachment');
  formData.append('source_type', payload.source_type || 'text');

  (payload.tags || []).forEach((tag) => {
    formData.append('tags', tag);
  });

  return await apiClient.upload('/knowledge-sources/ingest-file', formData, token, payload.onUploadProgress);
}

export async function fetchKnowledgeSource(id) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.get(`/knowledge-sources/${id}`, token);
}

export async function updateKnowledgeSource(id, payload) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.patch(`/knowledge-sources/${id}`, payload, token);
}

export async function deleteKnowledgeSource(id) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.delete(`/knowledge-sources/${id}`, token);
}

export async function fetchRagContext(query) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/rag/context', { query }, token);
}

/**
 * Save content to history through the backend API.
 * @param {Object} historyData - History entry data
 * @returns {Promise<Object>} Created history entry
 */

export async function saveToHistory(historyData) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    console.warn('User token not available, skipping history save');
    return null;
  }

  // Strip large fields to avoid CloudFront/WAF body size limits returning 403.
  const safeData = {
    topic: String(historyData.topic || '').slice(0, 200),
    conversation_key: historyData.conversation_key || null,
    persona: historyData.persona || null,
    persona_label: historyData.persona_label || null,
    company_persona_id: historyData.company_persona_id || null,
    company_persona_name: String(historyData.company_persona_name || '').slice(0, 120) || null,
    company_tagline: String(historyData.company_tagline || '').slice(0, 180) || null,
    company_logo_url: String(historyData.company_logo_url || '').slice(0, 500) || null,
    company_persona_notes: String(historyData.company_persona_notes || '').slice(0, 500) || null,
    company_persona_visual_style_instructions: String(historyData.company_persona_visual_style_instructions || '').slice(0, 500) || null,
    company_persona_tuning_prompt: String(historyData.company_persona_tuning_prompt || '').slice(0, 500) || null,
    company_persona_learning_summary: String(historyData.company_persona_learning_summary || '').slice(0, 500) || null,
    content_type: String(historyData.content_type || '').slice(0, 80),
    tone: historyData.tone ?? null,
    length: historyData.length ?? null,
    keywords: String(historyData.keywords || '').slice(0, 500) || null,
    variants: Array.isArray(historyData.variants)
      ? historyData.variants.map((variant) => ({
          title: String(variant?.title || '').slice(0, 180) || null,
          content: String(variant?.content || '').slice(0, 1200),
          word_count: Number(variant?.word_count || 0),
          image_url: String(variant?.image_url || '').slice(0, 500) || null,
          image_prompt: String(variant?.image_prompt || '').slice(0, 500) || null,
          image_revised_prompt: String(variant?.image_revised_prompt || '').slice(0, 500) || null,
          video_url: String(variant?.video_url || '').slice(0, 500) || null,
          video_id: String(variant?.video_id || '').slice(0, 120) || null,
          video_status: String(variant?.video_status || '').slice(0, 40) || null,
        }))
      : [],
    refinement_messages: Array.isArray(historyData.refinement_messages)
      ? historyData.refinement_messages.map((message) => ({
          role: String(message?.role || '').slice(0, 20),
          content: String(message?.content || '').slice(0, 600),
          image_url: String(message?.image_url || '').slice(0, 500) || null,
          image_prompt: String(message?.image_prompt || '').slice(0, 500) || null,
          image_revised_prompt: String(message?.image_revised_prompt || '').slice(0, 500) || null,
          title: String(message?.title || '').slice(0, 180) || null,
        }))
      : [],
    original_prompt: String(historyData.original_prompt || '').slice(0, 1000) || null,
    rag_context: String(historyData.rag_context || '').slice(0, 1500) || null,
    status: String(historyData.status || 'completed').slice(0, 40),
    user_id: historyData.user_id || null,
    user_name: String(historyData.user_name || '').slice(0, 120) || null,
    user_email: String(historyData.user_email || '').slice(0, 120) || null,
    refinement_parent_history_id: historyData.refinement_parent_history_id || null,
    refinement_stage: String(historyData.refinement_stage || '').slice(0, 80) || null,
  };

  try {
    return await apiClient.post('/history', safeData, token);
  } catch (error) {
    const message = error?.message || 'Unable to save history entry';
    console.error('History save error:', error);
    throw new Error(message);
  }
}

/**
 * Fetch content history from the backend API.
 * @param {number} limit - Number of entries to fetch
 * @returns {Promise<Array>} Array of history entries
 */
export async function fetchHistory(limit = 10, before = '') {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  const query = before
    ? `/history?limit=${limit}&before=${encodeURIComponent(before)}`
    : `/history?limit=${limit}`;

  return await apiClient.get(query, token);
}

/**
 * Delete a content history entry through the backend API.
 * @param {string} id - Entry ID
 * @returns {Promise<void>}
 */
export async function deleteHistoryEntry(id) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  await apiClient.patch(`/history/${id}/delete`, {}, token);
}

export async function submitSupportRequest(payload) {
  const token = tokenStorage.getUserToken();
  if (!token) {
    throw new Error('User token not available');
  }

  return await apiClient.post('/support-requests', payload, token);
}
