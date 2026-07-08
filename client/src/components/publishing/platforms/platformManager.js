// src/components/publishing/platforms/platformManager.js
import { WordPress } from './wordpress';
import { Hashnode } from './hashnode';
import { DevTo } from './devto';
import { Instagram } from './instagram';

const platformClasses = {
  wordpress: WordPress,
  hashnode: Hashnode,
  devto: DevTo,
  instagram: Instagram
};

const platformInstances = {};

export function getPlatform(platformName) {
  if (!platformClasses[platformName]) {
    throw new Error(`Unknown platform: ${platformName}`);
  }
  
  if (!platformInstances[platformName]) {
    platformInstances[platformName] = new platformClasses[platformName]();
  }
  
  return platformInstances[platformName];
}

export function getActivePlatforms() {
  return [
    getPlatform('wordpress'),
    getPlatform('hashnode'),
    getPlatform('devto')
  ];
}

export function getAllPlatforms() {
  return Object.keys(platformClasses).map(name => getPlatform(name));
}
