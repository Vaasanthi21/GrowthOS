// src/components/publishing/platforms/wordpress.js
import { BasePlatform } from './base';
import { apiClient } from "@/api/apiClient";

export class WordPress extends BasePlatform {
  constructor() {
    super({
      name: 'wordpress',
      label: 'WordPress',
      color: '#21759B',
      emoji: '🔵',
      authLabel: 'Application Password',
      authFields: [
        { key: 'siteUrl', label: 'WordPress Site URL', type: 'url', required: true, placeholder: 'https://yourblog.com' },
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'appPassword', label: 'Application Password', type: 'password', required: true, hint: 'WP Admin → Users → Application Passwords' }
      ]
    });
  }

  async publish(content, token) {
    return await apiClient.post("/publish/wp/post", {
      siteUrl: content.siteUrl,
      title: content.title,
      content: content.body,
      status: content.status || 'publish'
    }, token);
  }
}
