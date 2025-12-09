FROM node:20-alpine

# Install git (needed for some npm packages)
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (skip postinstall since client is built separately)
RUN npm install --ignore-scripts

COPY src ./src

EXPOSE 3001

CMD ["npx", "ts-node", "src/server.ts"]