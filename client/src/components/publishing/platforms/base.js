// src/components/publishing/platforms/base.js
import { apiClient } from "@/api/apiClient";

export class BasePlatform {
  constructor(config) {
    this.name = config.name;
    this.label = config.label;
    this.color = config.color;
    this.emoji = config.emoji;
    this.authLabel = config.authLabel;
    this.authFields = config.authFields;
  }

  async connect(credentials, token) {
    return await apiClient.post("/publish/accounts/connect", {
      platform: this.name,
      credentials
    }, token);
  }

  async disconnect(token) {
    return await apiClient.post("/publish/accounts/disconnect", {
      platform: this.name
    }, token);
  }

  async verify(token) {
    return await apiClient.post(`/publish/accounts/${this.name}/verify`, {}, token);
  }

  getMeta() {
    return {
      name: this.name,
      label: this.label,
      color: this.color,
      emoji: this.emoji,
      authLabel: this.authLabel
    };
  }

  async publish(content, token) {
    throw new Error(`publish() must be implemented by ${this.label} platform`);
  }
}
