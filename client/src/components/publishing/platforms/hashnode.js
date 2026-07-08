// src/components/publishing/platforms/hashnode.js
import { BasePlatform } from './base';
import { apiClient } from "@/api/apiClient";

export class Hashnode extends BasePlatform {
  constructor() {
    super({
      name: 'hashnode',
      label: 'Hashnode',
      color: '#2962FF',
      emoji: '🔷',
      authLabel: 'Personal Access Token',
      authFields: [
        { key: 'apiKey', label: 'Personal Access Token', type: 'password', required: true, hint: 'hashnode.com → Account Settings → Developer' },
        { key: 'publicationId', label: 'Publication ID', type: 'text', required: true, hint: 'Found in your Hashnode publication settings' }
      ]
    });
  }

  async publish(content, token) {
    return await apiClient.post("/publish/hashnode/post", {
      publicationId: content.publicationId,
      title: content.title,
      content: content.body,
      tags: content.tags || []
    }, token);
  }
}
