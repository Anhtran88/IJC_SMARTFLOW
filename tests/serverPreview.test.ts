import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';

test('npm start serves built pages and API without the Vite WebSocket client', { timeout: 15000 }, async () => {
  // Select an available port so this check can run alongside the app.
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const env: NodeJS.ProcessEnv = { ...process.env, DEFAULT_APP_PORT: String(port) };
  delete env.NODE_ENV; // npm start must work even when the host doesn't set production.
  const child = spawn('npm', ['run', 'start'], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      assert.equal(child.exitCode, null, logs);
      try {
        ready = (await fetch(`${base}/api/health`)).ok;
        if (ready) break;
      } catch { /* Server is starting. */ }
      await delay(100);
    }
    assert.ok(ready, logs);
    for (const route of ['/', '/orders/example']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /\/assets\/.*\.js/);
      assert.doesNotMatch(html, /\/@vite\/client|\/@react-refresh|\/index\.tsx/);
      assert.doesNotMatch(html, /reasonStr\.includes\('WebSocket'\)|reasonStr\.includes\('vite'\)/);
    }
    const result = await fetch(`${base}/api/gemini/extract-bm02`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(result.status, 400);
    assert.ok((await result.json()).error);
  } finally {
    const exited = once(child, 'exit');
    process.kill(-child.pid!, 'SIGTERM');
    await exited;
  }
});
