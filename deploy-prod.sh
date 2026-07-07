#!/bin/bash

# Exit on error
set -e

echo "Starting GrowthOS Production Deployment..."

cd /home/ubuntu/growth_os

# Fetch and pull latest changes
echo "Fetching and pulling latest changes..."
git fetch growthos main
git checkout main
git pull growthos main

# ----------------- Backend Setup -----------------
echo "Setting up Backend..."
cd server/
npm install --production

# PM2 Deployment
echo "Reloading/starting backend PM2 process..."
pm2 describe growth-os-backend-prod > /dev/null 2>&1
if [ $? -eq 0 ]; then
  pm2 reload growth-os-backend-prod --update-env
else
  pm2 start index.js --name growth-os-backend-prod
fi

cd /home/ubuntu/growth_os

# ----------------- Frontend Setup -----------------
echo "Setting up Frontend..."
cd client/
npm install
npm run build

# Copy static assets to Nginx folder
echo "Copying static assets to Nginx public folder..."
mkdir -p /var/www/growth-os-prod
rm -rf /var/www/growth-os-prod/*
cp -r dist/* /var/www/growth-os-prod/

echo "Deployment completed successfully!"
