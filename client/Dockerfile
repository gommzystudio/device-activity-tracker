# Client Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

# Install git and build dependencies
RUN apk add --no-cache git python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and config
COPY public ./public
COPY src ./src
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Build argument for API URL
ARG REACT_APP_API_URL=http://localhost:3001
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=build /app/build /usr/share/nginx/html

# Expose port
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE ${PORT}

# Start nginx with the specified port
CMD sed -i "s/listen 80;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
