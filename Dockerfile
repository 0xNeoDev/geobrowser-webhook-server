FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (cached layer)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# App source + migrations
COPY src/ src/
COPY drizzle/ drizzle/
COPY drizzle.config.ts ./

USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
