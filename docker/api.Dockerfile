FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @commerce/api build
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["pnpm","--filter","@commerce/api","start"]
