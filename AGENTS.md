# AGENTS.md — website-redesign-runner-mcp

Purpose: MCP bridge that exposes the website redesign runner to MCP clients
(bounded tool surface, SSE/HTTP transport).
GitHub: `lutzkind/website-redesign-runner-mcp` (public) · Canonical checkout:
`/root/website-redesign-runner-mcp` · Default branch: `main`.

## Start here

- Docs: `README.md`, `DEPLOYMENT.md`. No ARCHITECTURE/HANDOFF exists.
- Host map: `/root/REPO_MAP.md`.
- `/root/mcp-shared/chatgpt/**` is continuity/history evidence, not the source
  of truth.

## Branch / state rule

- Observed 2026-10-01: on `fix/callback-replay-mode-contract`, 3 behind `main`.
  Check `git status -sb`; do not switch without authorization.
- Local checkout is not proof of main/production.

## Repository map

- `index.js` — single-file MCP server; `index.test.js` — the whole test suite
  (24 KB, seconds); `DEPLOYMENT.md` — deploy steps.

## Commands

| Purpose | Command |
|---|---|
| Install | `npm install` |
| Test | `npm test` (`node --test`) |
| Run | `RUNNER_URL=https://runner.relaunchpilot.com npm start` |

## CI reality

- `ci-standard.yml` runs `npm ci` + `npm test` — the whole suite.

## Production

- Containers on the Coolify network: `mcp-website-redesign-runner` +
  `mcp-website-redesign-runner-bridge` (bridge maps wrapper SSE to Codex
  streamable HTTP).
- Default upstream `RUNNER_URL=https://runner.relaunchpilot.com` (the
  `website-redesign-runner` app).
- Deploy follows `DEPLOYMENT.md` (no Dockerfile/compose in this repo): update
  the container from a validated commit, restart, then check `/health`,
  `tools/list`, and a read-only `read_service_health` call.
- Live verification: MCP read-only tool call plus runner health; do not claim
  production from Git state.

## Traps

- This repository is public while sibling repos are private: never add secrets,
  tokens, or internal URLs beyond what `DEPLOYMENT.md` already documents.
- No Dockerfile; do not invent a build path.

## Do not read/search by default

- `/root/agent-tmp/**`, `/root/mcp-shared/chatgpt/**`, `node_modules/`.
