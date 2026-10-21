import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiRunner } from '../services/geminiRetry';
import { requestBm02Extraction } from '../services/ocrApi';

test('503 switches model before waiting', async () => {
  const calls: string[] = [];
  const run = createGeminiRunner({ models: ['busy', 'working'], wait: async () => assert.fail('unnecessary wait') });
  assert.equal(await run(async model => {
    calls.push(model);
    if (model === 'busy') throw { status: 503 };
    return 'extracted';
  }), 'extracted');
  assert.deepEqual(calls, ['busy', 'working']);
});

test('persistent outage has bounded retries and increasing delays', async () => {
  const delays: number[] = [];
  let calls = 0;
  const run = createGeminiRunner({ models: ['a', 'b'], random: () => 0, wait: async ms => { delays.push(ms); } });
  await assert.rejects(run(async () => { calls++; throw { code: 503 }; }), /503/);
  assert.equal(calls, 6);
  assert.deepEqual(delays, [2000, 4000]);
});

test('quota cooldown returns an actionable error on repeated requests', async () => {
  let calls = 0;
  const run = createGeminiRunner({ models: ['a'], now: () => 0 });
  const generate = async () => { calls++; throw { status: 429 }; };
  await assert.rejects(run(generate), /429/);
  await assert.rejects(run(generate), /429/);
  assert.equal(calls, 1);
});

test('missing model falls back and authorization errors stop immediately', async () => {
  const run = createGeminiRunner({ models: ['missing', 'available'] });
  assert.equal(await run(async model => { if (model === 'missing') throw { status: 404 }; return 'ok'; }), 'ok');
  let calls = 0;
  await assert.rejects(run(async () => { calls++; throw { status: 403 }; }), /API Key/);
  assert.equal(calls, 1);
});

test('OCR preserves server errors without calling a browser fallback', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: 'AI quá tải (503)' }, { status: 503 }); };
  try {
    await assert.rejects(requestBm02Extraction('YQ==', 'application/pdf', 'sample.pdf'), /AI quá tải/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('OCR infers Office MIME types and rejects empty results', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.match(JSON.parse(String(init?.body)).mimeType, /spreadsheetml/);
    return Response.json({ success: true, data: { items: [] } });
  };
  try {
    await assert.rejects(requestBm02Extraction('YQ==', 'application/pdf', 'sample.xlsx'), /hợp lệ/);
  } finally { globalThis.fetch = originalFetch; }
});
