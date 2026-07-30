import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const RUNNER_URL = (process.env.RUNNER_URL || 'https://runner.relaunchpilot.com').replace(/\/$/, '');
const JOB_ID_RE = /^job_[A-Za-z0-9]{6,80}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LIMIT = 100;
const SENSITIVE_KEY_RE = /token|secret|password|credential|authorization|cookie|api[_-]?key|private[_-]?key|headers?/i;

const TOOLS = [
  {
    name: 'search_jobs',
    description: 'Search bounded Website Redesign Runner job summaries by exact identifiers, lead email, domain, status, references, or creation range.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' }, lead_email: { type: 'string' }, source_domain: { type: 'string' },
        external_reference: { type: 'string' }, windmill_execution_id: { type: 'string' }, gmail_message_id: { type: 'string' },
        campaign_id: { type: 'string' }, provider_lead_id: { type: 'string' }, status: { type: 'string' },
        created_from: { type: 'string' }, created_to: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 25 },
        cursor: { type: 'integer', minimum: 0, default: 0 },
      },
    },
  },
  {
    name: 'read_job',
    description: 'Read one explicit runner job with bounded, redacted configuration, failure, artifact, callback, timeline, and external-reference details.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object', required: ['job_id'], properties: { job_id: { type: 'string' } } },
  },
  {
    name: 'read_job_logs',
    description: 'Read bounded logs associated with one explicit runner job, optionally filtered by stage, severity, cursor, or time range.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: {
      type: 'object', required: ['job_id'], properties: {
        job_id: { type: 'string' }, stage: { type: 'string' }, severity: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' }, cursor: { type: 'integer', minimum: 0, default: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
      },
    },
  },
  {
    name: 'retry_job',
    description: 'Preview or explicitly apply a retry for one failed or canceled runner job. Preview is the default and completed/running jobs are rejected.',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object', required: ['job_id'], properties: {
        job_id: { type: 'string' }, reason: { type: 'string', description: 'Operator reason for the retry.' },
        apply: { type: 'boolean', default: false, description: 'Set true only after reviewing the preview.' },
      },
    },
  },
  {
    name: 'read_service_health',
    description: 'Read bounded runner service health for the runner, queue, browser dependency, and deployed version.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object', properties: {} },
  },
];

function assertToken() {
  if (!String(process.env.RUNNER_MCP_TOKEN || '').trim()) throw new Error('RUNNER_MCP_TOKEN is not configured');
}

function assertJobId(jobId) {
  if (typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) throw new Error('invalid job_id');
}

function boundedInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) throw new Error('invalid pagination value');
  return Math.min(value, max);
}

function sanitize(value, key = '') {
  if (SENSITIVE_KEY_RE.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key)).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]).filter(([, childValue]) => childValue !== undefined));
  }
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[A-Za-z0-9._-]+/ig, 'Bearer [REDACTED]').replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+/ig, '[REDACTED]').slice(0, 12000);
  }
  return value;
}

async function runnerRequest(method, path, body) {
  assertToken();
  const options = { method, headers: { accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  options.headers.authorization = `Bearer ${String(process.env.RUNNER_MCP_TOKEN || '').trim()}`;
  const response = await fetch(`${RUNNER_URL}${path}`, options);
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const code = response.status === 401 ? 'UNAUTHORIZED' : response.status === 404 ? 'NOT_FOUND' : 'RUNNER_REQUEST_FAILED';
    throw new Error(`${code}: ${String(data.error || data.message || 'runner request failed').slice(0, 500)}`);
  }
  return sanitize(data);
}

function queryString(args, keys) {
  const query = new URLSearchParams();
  for (const key of keys) if (args[key] !== undefined && args[key] !== '') query.set(key, String(args[key]));
  return query.toString() ? `?${query}` : '';
}

async function searchJobs(args = {}) {
  if (args.lead_email !== undefined && !EMAIL_RE.test(args.lead_email)) throw new Error('invalid lead_email');
  if (args.job_id !== undefined) assertJobId(args.job_id);
  const limit = Math.max(1, boundedInteger(args.limit, 25, MAX_LIMIT));
  const cursor = boundedInteger(args.cursor, 0, 5000);
  return runnerRequest('GET', `/api/ops/jobs/search${queryString({ ...args, limit, cursor }, [
    'job_id', 'lead_email', 'source_domain', 'external_reference', 'windmill_execution_id', 'gmail_message_id',
    'campaign_id', 'provider_lead_id', 'status', 'created_from', 'created_to', 'limit', 'cursor',
  ])}`);
}

async function readJob({ job_id } = {}) {
  assertJobId(job_id);
  return runnerRequest('GET', `/api/ops/jobs/${encodeURIComponent(job_id)}`);
}

async function readJobLogs(args = {}) {
  assertJobId(args.job_id);
  const limit = Math.max(1, boundedInteger(args.limit, 200, 500));
  const cursor = boundedInteger(args.cursor, 0, 50000);
  return runnerRequest('GET', `/api/ops/jobs/${encodeURIComponent(args.job_id)}/logs${queryString({ ...args, limit, cursor }, ['stage', 'severity', 'from', 'to', 'limit', 'cursor'])}`);
}

async function retryJob({ job_id, reason = '', apply = false } = {}) {
  assertJobId(job_id);
  if (typeof apply !== 'boolean') throw new Error('apply must be boolean');
  if (apply && !String(reason).trim()) throw new Error('reason is required when apply=true');
  return runnerRequest('POST', `/api/ops/jobs/${encodeURIComponent(job_id)}/retry`, { apply, reason: String(reason).trim() });
}

async function readServiceHealth() {
  return runnerRequest('GET', '/api/ops/health');
}

async function handleTool(name, args = {}) {
  switch (name) {
    case 'search_jobs': return searchJobs(args);
    case 'read_job': return readJob(args);
    case 'read_job_logs': return readJobLogs(args);
    case 'retry_job': return retryJob(args);
    case 'read_service_health': return readServiceHealth();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server({ name: 'website-redesign-runner-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleTool(request.params.name, request.params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: String(error.message || error) }) }] };
    }
  });
  await server.connect(new StdioServerTransport());
}

export { TOOLS, sanitize, searchJobs, readJob, readJobLogs, retryJob, readServiceHealth, handleTool };

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { process.stderr.write(`Fatal: ${error.message}\n`); process.exit(1); });
