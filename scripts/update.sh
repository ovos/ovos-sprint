#!/bin/sh
set -e

. ~/.nvm/nvm.sh
nvm use 20.19.6

cd "$(dirname "$0")/.."

git pull

# Backend
cd backend/
npm install
npm run build
pm2 restart ovos-sprint
npm prune --production
cd ..

# Frontend - ignore lock file because it's generated on Windows
# and doesn't include Linux platform-specific binaries (e.g. rollup)
cd frontend/
rm -rf node_modules package-lock.json
npm install
npm run build
cd ..
