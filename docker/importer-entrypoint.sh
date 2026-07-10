#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- --help
fi

exec pnpm --dir /workspace --filter "$QDAI_PACKAGE_FILTER" exec tsx "$QDAI_PACKAGE_ENTRYPOINT" "$@"
