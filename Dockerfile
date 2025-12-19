# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install git and build dependencies
RUN apk add --no-cache git python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (ignore postinstall script that tries to install client deps)
RUN npm install --ignore-scripts

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Expose port (can be overridden by environment variable)
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Create directory for WhatsApp auth state
RUN mkdir -p /app/baileys_auth_info

CMD ["node", "dist/server.js"]
