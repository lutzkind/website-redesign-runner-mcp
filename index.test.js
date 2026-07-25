import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, handleTool, sanitize } from './index.js';

const originalFetch = globalThis.fetch;
function mockFetch(handler) { globalThis.fetch = async (url, options) => handler(String(url), options); }
function jsonResponse(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('exposes exactly the five bounded operations tools', () => {
  assert.deepEqual(TOOLS.map((tool) => tool.name), ['search_jobs', 'read_job', 'read_job_logs', 'retry_job', 'read_service_health']);
});

test('sanitizes secrets and bounds strings', () => {
  const result = sanitize({ authorization: 'secret', nested: { api_key: 'secret' }, message: 'Bearer abc' });
  assert.equal(result.authorization, undefined);
  assert.equal(result.nested.api_key, undefined);
  assert.equal(result.message, 'Bearer [REDACTED]');
});

test('search validates identifiers and sends bounded pagination', async () => {
  process.env.RUNNER_MCP_TOKEN = 'test-token';
  await assert.rejects(() => handleTool('search_jobs', { job_id: 'bad' }), /invalid job_id/);
  let seen;
  mockFetch((url, options) => { seen = { url, options }; return jsonResponse({ jobs: [{ job_id: 'job_abc123' }], limit: 100 }); });
  const result = await handleTool('search_jobs', { lead_email: 'person@example.com', limit: 500, cursor: 2 });
  assert.equal(result.jobs[0].job_id, 'job_abc123');
  assert.match(seen.url, /limit=100/);
  assert.match(seen.url, /cursor=2/);
  assert.equal(seen.options.headers.authorization, 'Bearer test-token');
});

test('read job, logs, and health use explicit safe routes', async () => {
  process.env.RUNNER_MCP_TOKEN = 'test-token';
  const urls = [];
  mockFetch((url) => { urls.push(url); return jsonResponse({ ok: true, logs: [] }); });
  await handleTool('read_job', { job_id: 'job_abc123' });
  await handleTool('read_job_logs', { job_id: 'job_abc123', limit: 5000 });
  await handleTool('read_service_health', {});
  assert.match(urls[0], /\/api\/ops\/jobs\/job_abc123$/);
  assert.match(urls[1], /\/logs\?/);
  assert.match(urls[2], /\/api\/ops\/health$/);
});

test('retry defaults to preview and requires a reason for apply', async () => {
  process.env.RUNNER_MCP_TOKEN = 'test-token';
  let seen;
  mockFetch((_url, options) => { seen = JSON.parse(options.body); return jsonResponse({ ok: true, preview_only: !seen.apply }); });
  const preview = await handleTool('retry_job', { job_id: 'job_abc123', reason: 'review' });
  assert.equal(preview.preview_only, true);
  assert.equal(seen.apply, false);
  await assert.rejects(() => handleTool('retry_job', { job_id: 'job_abc123', apply: true }), /reason is required/);
});

test('unauthorized runner response remains an MCP error', async () => {
  process.env.RUNNER_MCP_TOKEN = 'test-token';
  mockFetch(() => jsonResponse({ error: 'unauthorized' }, 401));
  await assert.rejects(() => handleTool('read_job', { job_id: 'job_abc123' }), /UNAUTHORIZED/);
});
