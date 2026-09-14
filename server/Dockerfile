# Multi-Stage Dockerfile for MandiConnect Backend API
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy installed dependencies and application code
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Create uploads directory with non-root permissions
RUN mkdir -p uploads && chown -R node:node /app

# Use non-root node user for container security
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
