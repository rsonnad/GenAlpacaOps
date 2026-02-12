import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// ============================================
// Configuration
// ============================================
const PORT = parseInt(process.env.PORT || '9100');
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aphrrfprbixmhissnjfn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPO_DIR = process.env.REPO_DIR || '/opt/headless-runner/repo';
const INSTRUCTIONS_DIR = 'claude-headless-instructions';
const MAX_RUN_TIMEOUT_MS = parseInt(process.env.MAX_RUN_TIMEOUT_MS || '600000'); // 10 minutes
const TEAM_EMAIL = 'team@alpacaplayhouse.com';

if (!WEBHOOK_SECRET) {
  console.error('GITHUB_WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// Logging
// ============================================
function log(level, msg, data = {}) {
  const ts = new Date().toISOString();
  const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] [${level}] ${msg}${dataStr}`);
}

// ============================================
// Webhook signature verification
// ============================================
function verifySignature(payload, signature) {
  if (!signature) return false;
  const sig = Buffer.from(signature);
  const hmac = createHmac('sha256', WEBHOOK_SECRET);
  const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'));
  if (sig.length !== digest.length) return false;
  return timingSafeEqual(digest, sig);
}

// ============================================
// Git helpers
// ============================================
async function gitPull() {
  await execAsync('git fetch origin && git reset --hard origin/main', { cwd: REPO_DIR });
  log('info', 'Git pull complete');
}

async function gitCommitAndPush(message) {
  await execAsync('git add -A', { cwd: REPO_DIR });
  const { stdout: status } = await execAsync('git status --porcelain', { cwd: REPO_DIR });
  if (!status.trim()) {
    log('info', 'No changes to commit');
    return;
  }
  await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd: REPO_DIR });
  await execAsync('git push origin main', { cwd: REPO_DIR });
  log('info', 'Changes committed and pushed to main');
}

// ============================================
// Claude Code execution
// ============================================
async function runClaudeCode(instructions, filename) {
  const prompt = `You are running a headless task dispatched from Claude Code on Android.
The user wrote these instructions into ${filename}:

---
${instructions}
---

Execute these instructions. Follow CLAUDE.md conventions for this project.
Do NOT run any git commands or update the version number.

When done, output a JSON object: { "summary": "what you did", "files_changed": ["list of files"], "notes": "any caveats" }`;

  const args = [
    '-p', prompt,
    '--allowedTools', 'Write,Edit,Read,Glob,Grep,Bash',
    '--max-turns', '30',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
  ];

  log('info', 'Running Claude Code', { filename, prompt_length: prompt.length });

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: REPO_DIR,
      env: {
        ...process.env,
        CI: 'true',
        HOME: process.env.HOME || '/home/bugfixer',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: MAX_RUN_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (chunk.trim()) log('debug', 'Claude stderr', { text: chunk.trim().substring(0, 200) });
    });

    child.stdin.end();

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude Code timed out after ${MAX_RUN_TIMEOUT_MS / 1000}s`));
    }, MAX_RUN_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeout);
      log('info', 'Claude Code exited', { code, stdout_length: stdout.length });

      if (code !== 0) {
        reject(new Error(`Claude Code failed (exit ${code}): ${(stderr || stdout).substring(0, 2000)}`));
        return;
      }

      let result = { summary: 'Task completed.', files_changed: [], notes: '' };
      try {
        const output = JSON.parse(stdout);
        let inner = output.result || output;
        if (typeof inner === 'string') {
          const fenceMatch = inner.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
          if (fenceMatch) inner = fenceMatch[1].trim();
          try { inner = JSON.parse(inner); } catch {
            result.summary = inner.substring(0, 500);
            resolve(result);
            return;
          }
        }
        if (inner.summary) result.summary = inner.summary;
        if (inner.files_changed) result.files_changed = inner.files_changed;
        if (inner.notes) result.notes = inner.notes;
      } catch {
        if (stdout) result.summary = stdout.substring(0, 500);
      }
      resolve(result);
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });
  });
}

// ============================================
// Send notification email
// ============================================
async function sendNotificationEmail(filename, result, error = null) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'custom',
        to: TEAM_EMAIL,
        data: {
          subject: error
            ? `Headless task failed: ${filename}`
            : `Headless task completed: ${filename}`,
          body: error
            ? `<p>The headless task <strong>${filename}</strong> failed:</p><pre>${error}</pre>`
            : `<p>The headless task <strong>${filename}</strong> completed.</p>
               <p><strong>Summary:</strong> ${result.summary}</p>
               ${result.files_changed?.length ? `<p><strong>Files:</strong> ${result.files_changed.join(', ')}</p>` : ''}
               ${result.notes ? `<p><strong>Notes:</strong> ${result.notes}</p>` : ''}`,
        },
      }),
    });
    if (!res.ok) {
      log('error', 'Notification email failed', { status: res.status });
    }
  } catch (err) {
    log('error', 'Notification email error', { error: err.message });
  }
}

// ============================================
// Process instruction files
// ============================================
let isProcessing = false;

async function processInstructionFiles(addedFiles) {
  if (isProcessing) {
    log('warn', 'Already processing — skipping');
    return;
  }
  isProcessing = true;

  try {
    await gitPull();

    // Filter to only instruction files (not .gitkeep)
    const instructionFiles = addedFiles.filter(f =>
      f.startsWith(`${INSTRUCTIONS_DIR}/`) &&
      f.endsWith('.md')
    );

    if (instructionFiles.length === 0) {
      log('info', 'No instruction .md files in push — ignoring');
      return;
    }

    for (const file of instructionFiles) {
      const fullPath = path.join(REPO_DIR, file);
      const filename = path.basename(file);

      if (!existsSync(fullPath)) {
        log('warn', 'Instruction file not found after pull', { file });
        continue;
      }

      log('info', '=== Processing headless instruction ===', { file: filename });

      try {
        // Read the instructions
        const instructions = await readFile(fullPath, 'utf-8');
        log('info', 'Instruction content', { length: instructions.length, preview: instructions.substring(0, 200) });

        // Run Claude Code
        const result = await runClaudeCode(instructions, filename);
        log('info', 'Task completed', { summary: result.summary });

        // Delete the instruction file (consumed)
        await unlink(fullPath);

        // Commit the work + instruction file deletion
        await gitCommitAndPush(`headless: ${filename} — ${result.summary.substring(0, 60)}`);

        // Notify
        await sendNotificationEmail(filename, result);

        log('info', '=== Headless instruction done ===', { file: filename });

      } catch (err) {
        log('error', 'Headless task failed', { file: filename, error: err.message });

        // Clean up git state
        try {
          await execAsync('git checkout main 2>/dev/null; git checkout -- . && git clean -fd', { cwd: REPO_DIR });
        } catch { /* ignore */ }

        await sendNotificationEmail(filename, null, err.message.substring(0, 1000));
      }
    }
  } finally {
    isProcessing = false;
  }
}

// ============================================
// HTTP server for GitHub webhooks
// ============================================
const server = createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', processing: isProcessing }));
    return;
  }

  // Only accept POST to webhook path
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // Verify signature
  const signature = req.headers['x-hub-signature-256'];
  if (!verifySignature(body, signature)) {
    log('warn', 'Invalid webhook signature');
    res.writeHead(401);
    res.end('Invalid signature');
    return;
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(body.toString());
  } catch {
    res.writeHead(400);
    res.end('Invalid JSON');
    return;
  }

  // Only handle push events to main
  const event = req.headers['x-github-event'];
  if (event !== 'push') {
    res.writeHead(200);
    res.end('Ignored event');
    return;
  }

  if (payload.ref !== 'refs/heads/main') {
    res.writeHead(200);
    res.end('Ignored branch');
    return;
  }

  // Check if any added/modified files are in claude-headless-instructions/
  const addedFiles = [];
  for (const commit of payload.commits || []) {
    for (const file of (commit.added || [])) {
      if (file.startsWith(`${INSTRUCTIONS_DIR}/`)) {
        addedFiles.push(file);
      }
    }
    for (const file of (commit.modified || [])) {
      if (file.startsWith(`${INSTRUCTIONS_DIR}/`)) {
        addedFiles.push(file);
      }
    }
  }

  if (addedFiles.length === 0) {
    res.writeHead(200);
    res.end('No instruction files in push');
    return;
  }

  log('info', 'Webhook received — instruction files detected', { files: addedFiles });

  // Respond immediately, process async
  res.writeHead(202);
  res.end('Accepted');

  // Process in background
  processInstructionFiles(addedFiles).catch(err => {
    log('error', 'processInstructionFiles unhandled error', { error: err.message });
  });
});

// ============================================
// Startup
// ============================================
async function main() {
  log('info', 'Headless Runner starting', {
    port: PORT,
    repo: REPO_DIR,
    max_timeout: MAX_RUN_TIMEOUT_MS,
  });

  if (!existsSync(REPO_DIR)) {
    log('error', `Repo directory does not exist: ${REPO_DIR}`);
    process.exit(1);
  }

  // Verify Claude Code is installed
  try {
    const { stdout: claudeVer } = await execAsync('claude --version 2>/dev/null || echo unknown');
    log('info', 'Claude Code CLI found', { version: claudeVer.trim() });
  } catch {
    log('error', 'Claude Code CLI not found');
    process.exit(1);
  }

  await gitPull();

  server.listen(PORT, () => {
    log('info', `Webhook server listening on port ${PORT}`);
    log('info', `Health check: http://localhost:${PORT}/health`);
    log('info', `Webhook endpoint: http://localhost:${PORT}/webhook`);
  });
}

main().catch(err => {
  log('error', 'Fatal error', { error: err.message });
  process.exit(1);
});
