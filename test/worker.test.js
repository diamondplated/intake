import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = { PASSCODE: 'hunter2', SESSION_SECRET: 'test-secret', GITHUB_TOKEN: 'ghp_test' };
const BASE = 'https://intake.test';
const realFetch = globalThis.fetch;
let calls;
let branchExists;
let labelsFail;

// Fake just enough of the GitHub API.
beforeEach(() => {
  calls = [];
  branchExists = false;
  labelsFail = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.github.com')) return realFetch(url, init);
    const path = u.slice('https://api.github.com'.length);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body, auth: init.headers.Authorization });
    const reply = (status, data) => new Response(JSON.stringify(data), { status });
    if (init.method === 'GET' && path.includes('/git/ref/heads/')) return branchExists ? reply(200, {}) : reply(404, { message: 'Not Found' });
    if (path.endsWith('/git/blobs')) return reply(201, { sha: 'blob1' });
    if (path.endsWith('/git/trees')) return reply(201, { sha: 'tree1' });
    if (path.endsWith('/git/commits')) return reply(201, { sha: 'commit1' });
    if (path.endsWith('/git/refs')) return reply(201, {});
    if (path.includes('/contents/')) return reply(201, {});
    if (path.endsWith('/issues')) {
      if (labelsFail && body.labels) return reply(422, { message: 'Validation Failed' });
      return reply(201, { number: 42, html_url: 'https://github.com/diamondplated/peach/issues/42' });
    }
    return reply(500, { message: 'unexpected ' + path });
  };
});

async function login() {
  const res = await worker.fetch(new Request(`${BASE}/login`, { method: 'POST', body: new URLSearchParams({ passcode: 'hunter2' }) }), env);
  return res.headers.get('Set-Cookie').split(';')[0];
}

function submit(cookie, fields, files = [], headers = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('screenshots', f);
  return worker.fetch(new Request(`${BASE}/api/issues`, { method: 'POST', body: fd, headers: { Cookie: cookie, ...headers } }), env);
}

const png = () => new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 'shot.png', { type: 'image/png' });
const fields = { project: 'peach', kind: 'bug', title: 'Button broken', description: 'It does nothing', reporter: 'Emily' };

test('shows login page without a session', async () => {
  const res = await worker.fetch(new Request(`${BASE}/`), env);
  assert.match(await res.text(), /Passcode/);
});

test('wrong passcode is rejected', async () => {
  const res = await worker.fetch(new Request(`${BASE}/login`, { method: 'POST', body: new URLSearchParams({ passcode: 'nope' }) }), env);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('Set-Cookie'), null);
});

test('right passcode sets a cookie that unlocks the form', async () => {
  const cookie = await login();
  const res = await worker.fetch(new Request(`${BASE}/`, { headers: { Cookie: cookie } }), env);
  const page = await res.text();
  assert.match(page, /Send it/);
  assert.match(page, /Cove \(Android\)/);
});

test('forged cookie does not work', async () => {
  const exp = Math.floor(Date.now() / 1000) + 1000;
  const res = await submit(`intake_session=${exp}.forged`, fields);
  assert.equal(res.status, 401);
});

test('files an issue with screenshots on a fresh repo', async () => {
  const res = await submit(await login(), fields, [png(), png()]);
  const data = await res.json();
  assert.equal(res.status, 201);
  assert.deepEqual(data, { number: 42, url: 'https://github.com/diamondplated/peach/issues/42', project: 'Peach' });

  assert.ok(calls.every((c) => c.auth === 'Bearer ghp_test'));
  const ref = calls.find((c) => c.path.endsWith('/git/refs'));
  assert.equal(ref.body.ref, 'refs/heads/intake-screenshots');
  assert.deepEqual(calls.find((c) => c.path.endsWith('/git/commits')).body.parents, []);

  const uploads = calls.filter((c) => c.path.includes('/contents/'));
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].body.branch, 'intake-screenshots');
  assert.equal(Buffer.from(uploads[0].body.content, 'base64')[0], 137);

  const issue = calls.find((c) => c.path === '/repos/diamondplated/peach/issues');
  assert.equal(issue.body.title, 'Button broken');
  assert.deepEqual(issue.body.labels, ['from-intake', 'bug']);
  assert.match(issue.body.body, /Reported by:\*\* Emily/);
  assert.match(issue.body.body, /!\[screenshot 2\]\(https:\/\/github\.com\/diamondplated\/peach\/blob\/intake-screenshots\/screenshots\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png\?raw=true\)/);
});

test('skips branch creation when it already exists', async () => {
  branchExists = true;
  await submit(await login(), { ...fields, kind: 'feature' }, [png()]);
  assert.ok(!calls.some((c) => c.path.endsWith('/git/refs')));
  assert.deepEqual(calls.find((c) => c.path.endsWith('/issues')).body.labels, ['from-intake', 'enhancement']);
});

test('no screenshots means no branch work', async () => {
  await submit(await login(), fields);
  assert.deepEqual(calls.map((c) => c.path), ['/repos/diamondplated/peach/issues']);
});

test('falls back to no labels if GitHub rejects them', async () => {
  labelsFail = true;
  const res = await submit(await login(), fields);
  assert.equal(res.status, 201);
  assert.match(calls.at(-1).body.body, /Labels that failed to apply/);
});

test('rejects unknown projects, missing titles and non-images', async () => {
  const cookie = await login();
  assert.equal((await submit(cookie, { ...fields, project: 'homelab' })).status, 400);
  assert.equal((await submit(cookie, { ...fields, title: '  ' })).status, 400);
  const txt = new File(['hi'], 'x.txt', { type: 'text/plain' });
  assert.equal((await submit(cookie, fields, [txt])).status, 400);
  assert.equal(calls.length, 0);
});

test('rejects cross-origin posts', async () => {
  const res = await submit(await login(), fields, [], { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('surfaces GitHub errors as 502', async () => {
  const cookie = await login();
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  const res = await submit(cookie, fields);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /Bad credentials/);
});
