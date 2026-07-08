// src/components/publishing/platforms/devto.js
import { BasePlatform } from './base';
import { apiClient } from "@/api/apiClient";

export class DevTo extends BasePlatform {
  constructor() {
    super({
      name: 'devto',
      label: 'Dev.to',
      color: '#0A0A0A',
      emoji: '⬛',
      authLabel: 'API Key',
      authFields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true, hint: 'dev.to → Settings → Extensions → API Keys' }
      ]
    });
  }

  async publish(content, token) {
    return await apiClient.post("/publish/devto/post", {
      apiKey: content.apiKey,
      title: content.title,
      bodyMarkdown: content.body,
      tags: content.tags || ['javascript']
    }, token);
  }
}
