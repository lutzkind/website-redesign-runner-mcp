# Website Redesign Runner MCP

Small, authenticated MCP for diagnosing Website Redesign Runner jobs and previewing a guarded single-job retry. It reads the runner's existing job state and bounded log files; it does not add a database, shell access, arbitrary HTTP, filesystem browsing, or generic container controls.

## Tools

- `search_jobs` — bounded exact/filter search returning summaries only.
- `read_job` — one explicit job with redacted configuration, failure, artifacts, callback, timeline, and references.
- `read_job_logs` — bounded logs for one explicit job.
- `retry_job` — preview by default; only failed/canceled jobs can be retried and apply requires a reason.
- `read_service_health` — bounded runner, queue, browser, and deployment status.

## Configuration

- `RUNNER_URL` — runner base URL; defaults to `https://runner.relaunchpilot.com`.
- `RUNNER_MCP_TOKEN` — bearer token matching the runner's `WEBSITE_REDESIGN_MCP_TOKEN`. Required; no credential is embedded in this repository.

The MCP process runs in the existing `mcp-optimized`/v16 SSE wrapper. The public bridge is protected with the same bearer-authenticated bridge pattern as the other production MCPs.

## Local test/run

```bash
npm install
npm test
RUNNER_URL=https://runner.relaunchpilot.com RUNNER_MCP_TOKEN=... npm start
```

## Deployment

Production uses a dedicated backend container on the existing `coolify` Docker network and a v16 SSE bridge on the existing `windmill.luxeillum.com` host. The route is `/website-redesign-runner-mcp`; deployment must provide `RUNNER_MCP_TOKEN` without committing it.
