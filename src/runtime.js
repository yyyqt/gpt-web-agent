import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { downloadImage, validateImage, IMAGE_LIMIT } from './images.js';

export const DEFAULT_LIMITS = { fileBytes: 1048576, outputBytes: 131072, concurrency: 4, timeoutSeconds: 600 };
const LIMIT_RANGES = { fileBytes: [1024, 16777216], outputBytes: [1024, 16777216], concurrency: [1, 16], timeoutSeconds: [1, 86400] };
const PRIVATE = /^(?:\.web-agent|\.git|\.dev\.vars(?:\..*)?|\.wrangler|\.codex|\.claude|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.env(?:\..*)?|.*\.(?:pem|key|p12))$/i;
const hash = data => createHash('sha256').update(data).digest('hex');
export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new BridgeError(code, message); };

export class Runtime {
  constructor(root, { allowHostExec = false, allowCodex = false, codexBinary = 'codex', readOnly = false, allowAbsolutePaths = false, stateDirectory, limits = {} } = {}) {
    this.root = root;
    this.allowAbsolutePaths = allowAbsolutePaths;
    this.stateDirectory = stateDirectory;
    this.allowHostExec = allowHostExec && !readOnly;
    this.readOnly = readOnly;
    this.allowCodex = allowCodex && !readOnly;
    this.codexBinary = codexBinary;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const [key, value] of Object.entries(this.limits)) {
      const range = LIMIT_RANGES[key];
      if (!range || !Number.isSafeInteger(value) || value < range[0] || value > range[1]) fail('INVALID_LIMIT', `Invalid ${key} limit`);
    }
    this.jobs = new Map();
    this.closing = false;
    this.queue = Promise.resolve();
  }
  async init() {
    this.root = await fs.realpath(this.root);
    if (!(await fs.stat(this.root)).isDirectory()) fail('NOT_DIRECTORY', 'Workspace must be a directory');
    this.state = this.stateDirectory || path.join(this.root, '.web-agent');
    try {
      const st = await fs.lstat(this.state);
      if (st.isSymbolicLink() || !st.isDirectory()) fail('UNSAFE_STATE', '.web-agent must be a real directory');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.mkdir(this.state, { mode: 0o700, recursive: true });
    for (const name of (await fs.readdir(this.state)).filter(n => /^job-[a-f0-9-]{36}\.json$/.test(n))) {
      const p = path.join(this.state, name), st = await fs.lstat(p);
      if (!st.isFile() || st.isSymbolicLink() || st.nlink > 1 || st.size > 128 * 1024 * 1024) fail('UNSAFE_STATE', 'Invalid job state file');
      const job = JSON.parse(await fs.readFile(p, 'utf8'));
      if (name !== `job-${job.id}.json` || typeof job.stdout !== 'string' || typeof job.stderr !== 'string' ||
          !['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(job.status)) fail('CORRUPT_STATE', 'Invalid saved job');
      if (['queued', 'running'].includes(job.status)) { job.status = 'interrupted'; job.recoveryNote = 'Previous runtime ended before recording a final result. No automatic retry; inspect side effects first.'; }
      this.jobs.set(job.id, job);
    }
    if (this.jobs.size > 100) fail('CORRUPT_STATE', 'Too many saved jobs; inspect .web-agent');
  }
  // Serializes mutations from concurrent MCP clients, including optimistic writes.
  exclusive(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {}); // caller receives the rejection; queue remains usable
    return run;
  }
  writable() { if (this.readOnly) fail('READ_ONLY', 'Server was started in read-only mode'); }
  async resolve(relative = '.', { missing = false } = {}) {
    if (typeof relative !== 'string' || relative.includes('\0') || (path.isAbsolute(relative) && !this.allowAbsolutePaths) || relative.includes('\\')) {
      fail('INVALID_PATH', 'Use a relative POSIX path inside the workspace');
    }
    const base = this.allowAbsolutePaths && path.isAbsolute(relative) ? path.parse(relative).root : this.root;
    const parts = relative.split('/').filter(p => p && p !== '.');
    if (parts.some(p => p === '..' || PRIVATE.test(p))) fail('PATH_DENIED', 'Parent traversal and private paths are not exposed');
    const target = path.join(base, ...parts);
    if (this.state && (target === this.state || target.startsWith(this.state + path.sep))) fail('PATH_DENIED', 'Runtime state is not exposed through file tools');
    let resolved = base;
    for (let i = 0; i < parts.length; i++) {
      resolved = path.join(resolved, parts[i]);
      try {
        const st = await fs.lstat(resolved);
        if (st.isSymbolicLink()) fail('SYMLINK_DENIED', 'Symbolic links are not followed');
        if (i < parts.length - 1 && !st.isDirectory()) fail('NOT_DIRECTORY', 'A parent path is not a directory');
      } catch (e) {
        if (e.code === 'ENOENT' && missing) return path.join(base, ...parts);
        throw e;
      }
    }
    return resolved;
  }
  async file(relative) {
    const p = await this.resolve(relative);
    const st = await fs.stat(p);
    if (!st.isFile()) fail('NOT_FILE', 'Expected a regular file');
    if (st.nlink > 1) fail('HARDLINK_DENIED', 'Hard-linked files are not exposed');
    if (st.size > this.limits.fileBytes) fail('FILE_TOO_LARGE', 'File exceeds configured text limit');
    const raw = await fs.readFile(p);
    if (raw.length > this.limits.fileBytes) fail('FILE_TOO_LARGE', 'File exceeds configured text limit');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch { fail('NOT_TEXT', 'File must be valid UTF-8'); }
    if (content.includes('\0')) fail('NOT_TEXT', 'Binary files are not exposed');
    return { path: relative, content, sha256: hash(raw), bytes: raw.length };
  }
  async list({ directory = '.', limit = 200 } = {}) {
    const p = await this.resolve(directory);
    const entries = await fs.readdir(p, { withFileTypes: true });
    const visible = entries.filter(e => path.join(p, e.name) !== this.state && !PRIVATE.test(e.name) && !e.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
    return { entries: visible.slice(0, limit).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other' })), truncated: visible.length > limit };
  }
  async write({ path: relative, content, expectedSha256 }) {
    this.writable();
    return this.exclusive(async () => {
      if (Buffer.byteLength(content) > this.limits.fileBytes) fail('FILE_TOO_LARGE', 'Content exceeds configured text limit');
      const p = await this.resolve(relative, { missing: true });
      if (p === this.root) fail('NOT_FILE', 'Cannot replace workspace root');
      let existing = null;
      try { existing = await this.file(relative); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (expectedSha256 === null ? existing !== null : existing?.sha256 !== expectedSha256) {
        fail('CONFLICT', 'File changed or existence differs. Read it again; use null only to create a new file.');
      }
      await fs.mkdir(path.dirname(p), { recursive: true });
      await this.resolve(relative, { missing: true });
      const tmp = path.join(path.dirname(p), `.bridge-${randomUUID()}.tmp`);
      const oldMode = existing ? (await fs.stat(p)).mode & 0o777 : 0o600;
      try {
        await fs.writeFile(tmp, content, { flag: 'wx', mode: oldMode });
        await fs.rename(tmp, p);
      } finally {
        await fs.rm(tmp, { force: true });
      }
      return { path: relative, sha256: hash(content), bytes: Buffer.byteLength(content) };
    });
  }
  async patch({ path: relative, expectedSha256, edits }) {
    this.writable();
    const original = await this.file(relative);
    if (original.sha256 !== expectedSha256) fail('CONFLICT', 'File changed; read it again');
    if (!Array.isArray(edits) || !edits.length || edits.length > 100) fail('INVALID_PATCH', 'Supply 1-100 edits');
    const ranges = edits.map(({ oldText, newText }) => {
      if (typeof oldText !== 'string' || !oldText.length || typeof newText !== 'string') fail('INVALID_PATCH', 'Each edit needs nonempty oldText and string newText');
      const start = original.content.indexOf(oldText);
      if (start < 0 || original.content.indexOf(oldText, start + 1) !== -1) fail('PATCH_MATCH', 'oldText must match exactly once in the original file');
      return { start, end: start + oldText.length, newText };
    }).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) if (ranges[i].start < ranges[i - 1].end) fail('PATCH_OVERLAP', 'Edits must not overlap');
    let content = original.content;
    for (const edit of ranges.reverse()) content = content.slice(0, edit.start) + edit.newText + content.slice(edit.end);
    return this.write({ path: relative, content, expectedSha256 });
  }
  async importImage({ file, path: relative, expectedSha256 = null }) {
    this.writable();
    await this.resolve(relative, { missing: true });
    const bytes = await downloadImage(file.download_url);
    const info = await validateImage(bytes, relative, file.mime_type);
    return this.exclusive(async () => {
      const p = await this.resolve(relative, { missing: true });
      let existing = null;
      try {
        const st = await fs.lstat(p);
        if (!st.isFile() || st.nlink > 1 || st.size > IMAGE_LIMIT) fail('IMAGE_TARGET', 'Target must be a regular unlinked image-sized file');
        existing = hash(await fs.readFile(p));
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (existing !== expectedSha256) fail('CONFLICT', 'Image target changed; null creates a new file only');
      await fs.mkdir(path.dirname(p), { recursive: true });
      await this.resolve(relative, { missing: true });
      const tmp = path.join(path.dirname(p), `.bridge-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
        await fs.rename(tmp, p);
      } finally { await fs.rm(tmp, { force: true }); }
      return { path: relative, sha256: hash(bytes), bytes: bytes.length, ...info };
    });
  }
  output({ id, stream = 'stdout', offset = 0, limit = 16384 }) {
    if (!['stdout', 'stderr'].includes(stream) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 65536) fail('INVALID_PAGE', 'Invalid output page');
    const job = this.job(id), value = job[stream];
    if (offset > value.length || (offset > 0 && /[\uDC00-\uDFFF]/.test(value[offset] || ''))) fail('INVALID_OFFSET', 'Use a previously returned nextOffset');
    let end = Math.min(offset + limit, value.length);
    if (end < value.length && /[\uDC00-\uDFFF]/.test(value[end])) end++;
    return { id, stream, offset, nextOffset: end, output: value.slice(offset, end), hasMore: end < value.length, status: job.status, exitCode: job.exitCode, truncated: job.truncated, offsetUnit: 'UTF-16 code units' };
  }
  async search({ query, directory = '.', limit = 50 }) {
    const hits = [], skipped = [];
    let examined = 0, truncated = false;
    const walk = async dir => {
      const resolvedDir = await this.resolve(dir);
      for (const e of await fs.readdir(resolvedDir, { withFileTypes: true })) {
        if (path.join(resolvedDir, e.name) === this.state || PRIVATE.test(e.name) || ['node_modules', 'vendor', 'dist', 'coverage'].includes(e.name) || e.isSymbolicLink()) continue;
        if (examined >= 2000 || hits.length >= limit) { truncated = true; return; }
        const relative = path.posix.join(dir, e.name);
        examined++;
        if (e.isDirectory()) await walk(relative);
        else if (e.isFile()) {
          let f;
          try { f = await this.file(relative); }
          catch (e) { skipped.push({ path: relative, code: e.code || 'READ_ERROR' }); continue; }
          const lines = f.content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              hits.push({ path: relative, line: i + 1, text: lines[i].slice(0, 1000) });
              if (hits.length >= limit) { truncated = true; return; }
            }
          }
        }
      }
    };
    await walk(directory);
    return { hits, examined, truncated, skipped: skipped.slice(0, 50), skippedCount: skipped.length };
  }
  async startJob({ command, cwd = '.', timeoutSeconds = Math.min(120, this.limits.timeoutSeconds) }) {
    this.writable();
    if (!this.allowHostExec) fail('EXEC_DISABLED', 'Restart with --allow-host-exec to permit unsandboxed commands');
    if (typeof command !== 'string' || !command.length || command.length > 16000) fail('INVALID_COMMAND', 'Command must be 1-16000 characters');
    return this.startProcess({ executable: '/bin/sh', args: ['-c', command], cwd, timeoutSeconds, kind: 'shell' });
  }
  async startCodex({ prompt, userRequestedDelegation = false, cwd = '.', timeoutSeconds = Math.min(1800, this.limits.timeoutSeconds) }) {
    this.writable();
    if (!this.allowCodex) fail('CODEX_DISABLED', 'Restart with --allow-codex to enable Codex tasks');
    if (userRequestedDelegation !== true) fail('DELEGATION_NOT_REQUESTED', 'User must explicitly request Codex delegation; otherwise use file and command tools directly');
    if (typeof prompt !== 'string' || !prompt.length || prompt.length > 32000) fail('INVALID_PROMPT', 'Prompt must be 1-32000 characters');
    // Pass prompts via stdin, never interpolate them into a shell command.
    return this.startProcess({ executable: this.codexBinary,
      args: ['exec', '--ignore-user-config', '--sandbox', 'workspace-write', '--skip-git-repo-check', '--color', 'never', '-'],
      input: prompt, cwd, timeoutSeconds, kind: 'codex' });
  }
  async startProcess({ executable, args, input, cwd, timeoutSeconds, kind }) {
    this.writable();
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > this.limits.timeoutSeconds) fail('INVALID_TIMEOUT', 'Timeout exceeds configured limit');
    if (this.closing) fail('SHUTTING_DOWN', 'Runtime is shutting down');
    const working = await this.resolve(cwd);
    if (!(await fs.stat(working)).isDirectory()) fail('NOT_DIRECTORY', 'cwd must be a directory');
    if (this.closing) fail('SHUTTING_DOWN', 'Runtime is shutting down');
    // Jobs share a bounded FIFO queue; a slot is held until the process actually closes.
    if (this.jobs.size >= 100) {
      const finished = [...this.jobs].find(([, j]) => j.status !== 'running' && (j.finishedAt || j.status === 'interrupted'));
      if (!finished) fail('QUEUE_FULL', 'At most 100 retained or pending jobs; wait for completion');
      if (finished) { this.jobs.delete(finished[0]); this.exclusive(() => fs.rm(path.join(this.state, `job-${finished[0]}.json`), { force: true })).catch(e => process.stderr.write(`Job eviction failed: ${e.message}\n`)); }
    }
    const id = randomUUID();
    const job = { id, kind, cwd, status: 'queued', queuedAt: new Date().toISOString(), startedAt: null, stdout: '', stderr: '', truncated: false, exitCode: null, signal: null, bytes: 0 };
    this.jobs.set(id, job);
    job.done = new Promise(resolve => { job.finish = resolve; });
    job.launch = () => {
    job.status = 'running'; job.startedAt = new Date().toISOString();
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: this.root, TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'en_US.UTF-8' };
    if (kind === 'codex') { env.HOME = os.homedir(); if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME; }
    const child = spawn(executable, args, { cwd: working, env, detached: true, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    if (input !== undefined) { child.stdin.on('error', e => { if (e.code !== 'EPIPE') process.stderr.write(`Codex stdin error: ${e.message}\n`); }); child.stdin.end(input); }
    job.child = child;
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    const append = field => chunk => {
      const remaining = this.limits.outputBytes - job.bytes;
      const taken = chunk.subarray(0, Math.max(remaining, 0));
      job[field] += decoders[field].write(taken);
      job.bytes += taken.length;
      if (taken.length < chunk.length) job.truncated = true;
    };
    child.stdout.on('data', append('stdout'));
    child.stderr.on('data', append('stderr'));
      child.once('error', e => { job.stderr += `Spawn failed: ${e.message}`; job.status = 'failed'; });
      child.once('close', async (code, signal) => {
        job.stdout += decoders.stdout.end(); job.stderr += decoders.stderr.end();
        job.closed = true;
        clearTimeout(job.timer);
        job.exitCode = code; job.signal = signal;
        if (job.status === 'running') job.status = code === 0 ? 'succeeded' : 'failed';
        job.finishedAt = new Date().toISOString();
        await this.persistJob(job);
        job.finish();
        this.drainJobs();
      });
    job.timer = setTimeout(() => this.stopJob(id, 'timed_out'), timeoutSeconds * 1000);
    job.timer.unref();
    void this.persistJob(job);
    };
    await this.persistJob(job);
    this.drainJobs();
    return this.job(id);
  }
  drainJobs() {
    if (this.closing) return;
    let active = [...this.jobs.values()].filter(j => j.child && !j.closed).length;
    for (const job of this.jobs.values()) {
      if (active >= this.limits.concurrency) break;
      if (job.status !== 'queued' || !job.launch) continue;
      active++;
      try { job.launch(); }
      catch (e) {
        job.status = 'failed'; job.stderr = `Launch failed: ${e.message}`;
        job.closed = true; job.finishedAt = new Date().toISOString();
        void this.persistJob(job).then(() => { job.finish(); this.drainJobs(); });
      }
    }
  }
  job(id) {
    const job = this.jobs.get(id);
    if (!job) fail('JOB_NOT_FOUND', 'Unknown job (old results may have been evicted)');
    const { child, timer, done, bytes, launch, finish, closed, ...result } = job;
    return result;
  }
  async persistJob(job) {
    try {
      await this.exclusive(async () => {
        const tmp = path.join(this.state, `job-${job.id}-${randomUUID()}.tmp`);
        try {
          await fs.writeFile(tmp, JSON.stringify(this.job(job.id)), { flag: 'wx', mode: 0o600 });
          await fs.rename(tmp, path.join(this.state, `job-${job.id}.json`));
        } finally { await fs.rm(tmp, { force: true }); }
      });
    } catch (e) { job.persistenceWarning = `Job result could not be saved: ${e.message}`; process.stderr.write(job.persistenceWarning + '\n'); }
  }
  listJobs() {
    return [...this.jobs.values()].map(j => ({ id: j.id, kind: j.kind, cwd: j.cwd, status: j.status, queuedAt: j.queuedAt, startedAt: j.startedAt, finishedAt: j.finishedAt, exitCode: j.exitCode })).sort((a, b) => (b.queuedAt || b.startedAt).localeCompare(a.queuedAt || a.startedAt));
  }
  stopJob(id, status = 'cancelled') {
    const job = this.jobs.get(id);
    if (!job) fail('JOB_NOT_FOUND', 'Unknown job');
    if (job.status === 'queued') {
      job.status = status; job.finishedAt = new Date().toISOString();
      void this.persistJob(job).then(() => job.finish());
    } else if (job.status === 'running') {
      job.status = status;
      // Kill the process group, not just the shell. Host commands can still escape deliberately.
      try { process.kill(-job.child.pid, 'SIGKILL'); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    return this.job(id);
  }
  async saveTask({ id, title, status, notes, expectedRevision }) {
    this.writable();
    return this.exclusive(async () => {
      const current = await this.tasks();
      const old = current.find(t => t.id === id);
      if ((old?.revision ?? 0) !== expectedRevision) fail('CONFLICT', 'Task revision changed; list tasks before updating');
      if (!old && current.length >= 100) fail('TASK_LIMIT', 'At most 100 saved tasks');
      const task = { id, title, status, notes, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
      const next = [...current.filter(t => t.id !== id), task];
      const tmp = path.join(this.state, `tasks-${randomUUID()}.tmp`);
      await fs.writeFile(tmp, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 });
      await fs.rename(tmp, path.join(this.state, 'tasks.json'));
      return task;
    });
  }
  async tasks() {
    try {
      const p = path.join(this.state, 'tasks.json');
      const st = await fs.lstat(p);
      if (!st.isFile() || st.isSymbolicLink() || st.nlink > 1 || st.size > 4 * 1024 * 1024) fail('UNSAFE_STATE', 'Invalid task state file');
      const data = JSON.parse(await fs.readFile(p, 'utf8'));
      if (!Array.isArray(data)) fail('CORRUPT_STATE', 'Task state is not an array');
      return data;
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  async audit(tool, outcome, errorCode) {
    const p = path.join(this.state, 'audit.jsonl');
    try {
      const st = await fs.lstat(p);
      if (!st.isFile() || st.isSymbolicLink() || st.nlink > 1) fail('UNSAFE_STATE', 'Audit file must be a regular, non-linked file');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.appendFile(p, JSON.stringify({ time: new Date().toISOString(), tool, outcome, ...(errorCode && { errorCode }) }) + '\n', { mode: 0o600 });
  }
  async close() {
    this.closing = true;
    for (const [id, job] of this.jobs) if (['running', 'queued'].includes(job.status)) this.stopJob(id);
    await Promise.all([...this.jobs.values()].map(j => j.done));
    await this.queue;
  }
}
