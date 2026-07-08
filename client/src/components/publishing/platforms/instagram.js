// src/components/publishing/platforms/instagram.js
import { BasePlatform } from './base';
import { apiClient } from "@/api/apiClient";

export class Instagram extends BasePlatform {
  constructor() {
    super({
      name: 'instagram',
      label: 'Instagram',
      color: '#E4405F',
      emoji: '🟣',
      authLabel: 'Access Token',
      authFields: [
        { key: 'accessToken', label: 'Instagram Access Token', type: 'password', required: true, hint: 'Get from Facebook Developer Portal' },
        { key: 'accountId', label: 'Instagram Account ID', type: 'text', required: true, hint: 'Found in Instagram Basic Display API' }
      ]
    });
  }

  async publish(content, token) {
    return await apiClient.post("/publish/instagram/post", {
      accountId: content.accountId,
      accessToken: content.accessToken,
      imageUrl: content.imageUrl,
      caption: content.caption || content.title
    }, token);
  }
}
