# Simple Dockerfile to run the bot in a container

FROM node:18-slim
WORKDIR /app

# Install dependencies first (takes advantage of Docker layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy rest of the source
COPY . .

# Build (if project uses TypeScript)
RUN if [ -f tsconfig.json ]; then npm run build --if-present; fi

# Default command
CMD ["npm", "run", "start"]
