FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS build
WORKDIR /app
COPY . /app

RUN corepack enable
RUN apk add --no-cache python3 alpine-sdk curl

# Install yt-dlp and Deno for YouTube extraction
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp
RUN curl -fsSL https://deno.land/install.sh | sh && mv /root/.deno/bin/deno /usr/local/bin/deno

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

RUN pnpm deploy --filter=@imput/cobalt-api --prod /prod/api

FROM base AS api
WORKDIR /app

# Copy yt-dlp and deno from build stage
COPY --from=build /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=build /usr/local/bin/deno /usr/local/bin/deno

COPY --from=build --chown=node:node /prod/api /app
COPY --from=build --chown=node:node /app/.git /app/.git

USER node

EXPOSE 9000
CMD [ "node", "src/cobalt" ]
