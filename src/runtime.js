import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const FILE_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 128 * 1024;
const PRIVATE = /^(?:\.web-agent|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.env(?:\..*)?|.*\.(?:pem|key|p12))$/i;
const hash = data => createHash('sha256').update(data).digest('hex');
export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new BridgeError(code, message); };

export class Runtime {
  constructor(root, { allowHostExec = false, readOnly = false } = {}) {
    this.root = root;
    this.allowHostExec = allowHostExec && !readOnly;
    this.readOnly = readOnly;
    this.jobs = new Map();
    this.closing = false;
    this.queue = Promise.resolve();
  }
  async init() {
    this.root = await fs.realpath(this.root);
    if (!(await fs.stat(this.root)).isDirectory()) fail('NOT_DIRECTORY', 'Workspace must be a directory');
    this.state = path.join(this.root, '.web-agent');
    try {
      const st = await fs.lstat(this.state);
      if (st.isSymbolicLink() || !st.isDirectory()) fail('UNSAFE_STATE', '.web-agent must be a real directory');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.mkdir(this.state, { mode: 0o700, recursive: true });
  }
  // Serializes mutations from concurrent MCP clients, including optimistic writes.
  exclusive(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {}); // caller receives the rejection; queue remains usable
    return run;
  }
  writable() { if (this.readOnly) fail('READ_ONLY', 'Server was started in read-only mode'); }
  async resolve(relative = '.', { missing = false } = {}) {
    if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative) || relative.includes('\\')) {
      fail('INVALID_PATH', 'Use a relative POSIX path inside the workspace');
    }
    const parts = relative.split('/').filter(p => p && p !== '.');
    if (parts.some(p => p === '..' || PRIVATE.test(p))) fail('PATH_DENIED', 'Parent traversal and private paths are not exposed');
    let resolved = this.root;
    for (let i = 0; i < parts.length; i++) {
      resolved = path.join(resolved, parts[i]);
      try {
        const st = await fs.lstat(resolved);
        if (st.isSymbolicLink()) fail('SYMLINK_DENIED', 'Symbolic links are not followed');
        if (i < parts.length - 1 && !st.isDirectory()) fail('NOT_DIRECTORY', 'A parent path is not a directory');
      } catch (e) {
        if (e.code === 'ENOENT' && missing) return path.join(this.root, ...parts);
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
    if (st.size > FILE_LIMIT) fail('FILE_TOO_LARGE', 'File exceeds the 1 MiB text limit');
    const raw = await fs.readFile(p);
    if (raw.length > FILE_LIMIT) fail('FILE_TOO_LARGE', 'File exceeds the 1 MiB text limit');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch { fail('NOT_TEXT', 'File must be valid UTF-8'); }
    if (content.includes('\0')) fail('NOT_TEXT', 'Binary files are not exposed');
    return { path: relative, content, sha256: hash(raw), bytes: raw.length };
  }
  async list({ directory = '.', limit = 200 } = {}) {
    const p = await this.resolve(directory);
    const entries = await fs.readdir(p, { withFileTypes: true });
    const visible = entries.filter(e => !PRIVATE.test(e.name) && !e.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name));
    return { entries: visible.slice(0, limit).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other' })), truncated: visible.length > limit };
  }
  async write({ path: relative, content, expectedSha256 }) {
    this.writable();
    return this.exclusive(async () => {
      if (Buffer.byteLength(content) > FILE_LIMIT) fail('FILE_TOO_LARGE', 'Content exceeds 1 MiB');
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
  async search({ query, directory = '.', limit = 50 }) {
    const hits = [], skipped = [];
    let examined = 0, truncated = false;
    const walk = async dir => {
      for (const e of await fs.readdir(await this.resolve(dir), { withFileTypes: true })) {
        if (PRIVATE.test(e.name) || ['node_modules', 'vendor', 'dist', 'coverage'].includes(e.name) || e.isSymbolicLink()) continue;
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
  async startJob({ command, cwd = '.', timeoutSeconds = 120 }) {
    this.writable();
    if (!this.allowHostExec) fail('EXEC_DISABLED', 'Restart with --allow-host-exec to permit unsandboxed commands');
    if (this.closing) fail('SHUTTING_DOWN', 'Runtime is shutting down');
    const working = await this.resolve(cwd);
    if (!(await fs.stat(working)).isDirectory()) fail('NOT_DIRECTORY', 'cwd must be a directory');
    if (this.closing) fail('SHUTTING_DOWN', 'Runtime is shutting down');
    // Synchronous reservation after the awaited path checks prevents oversubscription.
    if ([...this.jobs.values()].filter(j => j.status === 'running').length >= 2) fail('BUSY', 'At most two commands may run concurrently');
    if (this.jobs.size >= 100) {
      const finished = [...this.jobs].find(([, j]) => j.status !== 'running');
      if (finished) this.jobs.delete(finished[0]);
    }
    const id = randomUUID();
    const job = { id, status: 'running', startedAt: new Date().toISOString(), stdout: '', stderr: '', truncated: false, exitCode: null, signal: null, bytes: 0 };
    this.jobs.set(id, job);
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: this.root, TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'en_US.UTF-8' };
    const child = spawn('/bin/sh', ['-c', command], { cwd: working, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    job.child = child;
    const append = field => chunk => {
      const remaining = OUTPUT_LIMIT - job.bytes;
      const taken = chunk.subarray(0, Math.max(remaining, 0));
      job[field] += taken.toString('utf8');
      job.bytes += taken.length;
      if (taken.length < chunk.length) job.truncated = true;
    };
    child.stdout.on('data', append('stdout'));
    child.stderr.on('data', append('stderr'));
    job.done = new Promise(resolve => {
      child.once('error', e => { job.stderr += `Spawn failed: ${e.message}`; job.status = 'failed'; });
      child.once('close', (code, signal) => {
        clearTimeout(job.timer);
        job.exitCode = code; job.signal = signal;
        if (job.status === 'running') job.status = code === 0 ? 'succeeded' : 'failed';
        job.finishedAt = new Date().toISOString();
        resolve();
      });
    });
    job.timer = setTimeout(() => this.stopJob(id, 'timed_out'), timeoutSeconds * 1000);
    job.timer.unref();
    return this.job(id);
  }
  job(id) {
    const job = this.jobs.get(id);
    if (!job) fail('JOB_NOT_FOUND', 'Unknown job (jobs expire when the server restarts or old results are evicted)');
    const { child, timer, done, bytes, ...result } = job;
    return result;
  }
  stopJob(id, status = 'cancelled') {
    const job = this.jobs.get(id);
    if (!job) fail('JOB_NOT_FOUND', 'Unknown job');
    if (job.status === 'running') {
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
    for (const [id, job] of this.jobs) if (job.status === 'running') this.stopJob(id);
    await Promise.all([...this.jobs.values()].map(j => j.done));
    await this.queue;
  }
}
