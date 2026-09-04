# AgentCI Guard as a container. The committed dist/ bundles every runtime
# dependency, so the image needs nothing beyond Node itself: no install step,
# no node_modules, no network access at build time.
#
#   docker build -t agentci-guard .
#   docker run --rm -v "$PWD:/scan:ro" agentci-guard
#   docker run --rm -v "$PWD:/scan:ro" agentci-guard scan . --json
#   docker run --rm -v "$PWD:/scan:ro" -v "$PWD/out:/out" agentci-guard \
#     scan . --sarif /out/agentci.sarif --fail-on high
#
# Exit codes follow the CLI: 0 clean, 2 at or above --fail-on, 1 scanner error.

FROM node:24-alpine

LABEL org.opencontainers.image.title="AgentCI Guard" \
      org.opencontainers.image.description="Static analyzer for risky AI coding-agent usage in GitHub Actions workflows" \
      org.opencontainers.image.source="https://github.com/David-Wu1119/agentci-guard" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY package.json ./
COPY dist/ ./dist/

# The scan target is mounted here. Run as the unprivileged user the base image
# provides; the scanner only needs read access to the mount.
WORKDIR /scan
USER node

ENTRYPOINT ["node", "/app/dist/cli.js"]
CMD ["scan", "."]
