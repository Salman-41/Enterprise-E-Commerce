FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN pnpm --filter @commerce/web build && chown -R node:node /app/apps/web/.next
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm","--filter","@commerce/web","start"]
