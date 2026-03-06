FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Install system tools needed at runtime
RUN apk add --no-cache curl bash git sudo openssh-client python3

# Install only production dependencies
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY assets ./assets

# Create titan user with sudo access
RUN addgroup -g 1001 titan && adduser -D -u 1001 -G titan titan && \
    echo 'titan ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
USER titan

# Create TITAN home directory
RUN mkdir -p /home/titan/.titan

ENV NODE_ENV=production
ENV TITAN_HOME=/home/titan/.titan

EXPOSE 48420

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:48420/api/health || exit 1

ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["gateway"]
