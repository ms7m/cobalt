FROM node:24-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app
COPY . /app

RUN corepack enable

ARG WEB_DEFAULT_API="__WEB_DEFAULT_API__"
ENV WEB_DEFAULT_API=${WEB_DEFAULT_API}

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @imput/cobalt-web build

FROM nginx:1.27-alpine AS web

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker-entrypoint.sh /entrypoint.sh
COPY --from=build /app/web/build /opt/cobalt-web-template

RUN chmod +x /entrypoint.sh

EXPOSE 5173
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
