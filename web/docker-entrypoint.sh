#!/bin/sh
set -eu

TEMPLATE_DIR="/opt/cobalt-web-template"
OUTPUT_DIR="/usr/share/nginx/html"
PLACEHOLDER="__WEB_DEFAULT_API__"
DEFAULT_API="${WEB_DEFAULT_API:-http://localhost:9000}"

rm -rf "${OUTPUT_DIR:?}"/*
cp -a "${TEMPLATE_DIR}/." "$OUTPUT_DIR/"

escaped_api=$(printf '%s' "$DEFAULT_API" | sed 's/[\&|]/\\&/g')

find "$OUTPUT_DIR" -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' \) \
    -exec sed -i "s|$PLACEHOLDER|$escaped_api|g" {} +

exec "$@"
