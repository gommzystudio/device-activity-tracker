FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY tsconfig.json ./
COPY public ./public
COPY src ./src

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]