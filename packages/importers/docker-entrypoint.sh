#!/bin/sh
# Shared runtime entrypoint for packages/importers/Dockerfile.importer.
#
# Prefers a compiled entrypoint when the importer's own "build" script
# produced one (e.g. agent-skills-2-mcp -> dist/index.js), and otherwise runs
# the package's TS source directly through tsx, matching mcp-host's CLI
# execution model (`node --import tsx src/cli.mts`).
set -e

if [ -f "dist/index.js" ]; then
  exec node dist/index.js "$@"
fi

exec node --import tsx src/index.ts "$@"
