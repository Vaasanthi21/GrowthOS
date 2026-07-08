import { apiClient } from '../api/apiClient';

const api = {
  async get(path, config) {
    const data = await apiClient.get(path);
    return { data };
  },
  async post(path, body, config) {
    let data;
    if (body instanceof FormData) {
      const onProgress = config?.onUploadProgress
        ? (progress) => {
            config.onUploadProgress({
              loaded: progress.loaded,
              total: progress.total,
            });
          }
        : undefined;
      data = await apiClient.upload(path, body, undefined, onProgress);
    } else {
      data = await apiClient.post(path, body);
    }
    return { data };
  },
  async put(path, body, config) {
    const data = await apiClient.put(path, body);
    return { data };
  },
  async patch(path, body, config) {
    const data = await apiClient.patch(path, body);
    return { data };
  },
  async delete(path, config) {
    const data = await apiClient.delete(path);
    return { data };
  },
};

export default api;
