# Deployment notes

Use the same two-container pattern as the existing Windmill, ReachInbox, and NocoDB MCPs:

1. Run the backend from this repository with `COMMAND="node /app/website-redesign-runner-mcp/index.js"` on the existing `coolify` network.
2. Run the v16 SSE bridge with `--sse http://mcp-website-redesign-runner:3000/sse`, a unique bridge token, and the existing Traefik labels for `windmill.luxeillum.com`.
3. Supply `RUNNER_URL` and `RUNNER_MCP_TOKEN` through runtime environment only.
4. Check `/health`, `tools/list`, and a read-only `read_service_health` call after restart.

The bridge route is intentionally separate from `/safe-mcp` and uses the ChatGPT profile key `website_redesign_runner`.
