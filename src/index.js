import { PROJECTS, BASE_LABELS, KIND_LABELS, SCREENSHOT_BRANCH, MAX_SCREENSHOTS, MAX_SCREENSHOT_BYTES } from './projects.js';
import { safeEqual, sessionCookie, clearCookie, hasSession } from './auth.js';
import { ensureBranch, uploadFile, createIssue } from './github.js';
import { loginPage, formPage } from './page.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic' };

const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

function checkEnv(env) {
  const missing = ['PASSCODE', 'SESSION_SECRET', 'GITHUB_TOKEN'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing secrets: ${missing.join(', ')}`);
}

export async function fileIssue(form, env, now = new Date()) {
  const project = PROJECTS.find((p) => p.id === form.get('project'));
  const kind = form.get('kind');
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim();
  const reporter = String(form.get('reporter') || '').trim().slice(0, 80) || 'someone';
  const files = form.getAll('screenshots').filter((f) => typeof f === 'object' && f.size > 0);

  if (!project) return { status: 400, error: 'Pick a project.' };
  if (!KIND_LABELS[kind]) return { status: 400, error: 'Pick bug or feature.' };
  if (!title || title.length > 200) return { status: 400, error: 'Title is required (200 characters max).' };
  if (files.length > MAX_SCREENSHOTS) return { status: 400, error: `Max ${MAX_SCREENSHOTS} screenshots.` };
  for (const f of files) {
    if (!EXT[f.type]) return { status: 400, error: `${f.name || 'A file'} isn't a supported image (png, jpg, gif, webp, heic).` };
    if (f.size > MAX_SCREENSHOT_BYTES) return { status: 400, error: `${f.name || 'A file'} is over ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB.` };
  }

  const token = env.GITHUB_TOKEN;
  const images = [];
  if (files.length) {
    await ensureBranch(token, project.repo, SCREENSHOT_BRANCH);
    const day = now.toISOString().slice(0, 10);
    for (const [i, f] of files.entries()) {
      const path = `screenshots/${day}/${crypto.randomUUID()}.${EXT[f.type]}`;
      const url = await uploadFile(token, project.repo, SCREENSHOT_BRANCH, path, new Uint8Array(await f.arrayBuffer()));
      images.push(`![screenshot ${i + 1}](${url})`);
    }
  }

  const body = [
    `**Reported by:** ${reporter} · **Type:** ${kind === 'bug' ? 'Bug' : 'Feature request'}`,
    '',
    description || '_No description given._',
    ...(images.length ? ['', '### Screenshots', '', ...images] : []),
    '',
    '---',
    '_Filed from the intake site._',
  ].join('\n');

  const issue = await createIssue(token, project.repo, { title, body, labels: [...BASE_LABELS, KIND_LABELS[kind]] });
  return { status: 201, number: issue.number, url: issue.html_url, project: project.name };
}

export default {
  async fetch(request, env) {
    checkEnv(env);
    const url = new URL(request.url);
    const authed = await hasSession(request, env.SESSION_SECRET);

    if (request.method === 'GET' && url.pathname === '/') {
      return html(authed ? formPage(PROJECTS, { maxFiles: MAX_SCREENSHOTS }) : loginPage());
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      if (!sameOrigin(request)) return html(loginPage('Bad origin.'), 403);
      const form = await request.formData();
      if (await safeEqual(form.get('passcode') || '', env.PASSCODE, env.SESSION_SECRET)) {
        return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': await sessionCookie(env.SESSION_SECRET) } });
      }
      return html(loginPage('Wrong passcode.'), 401);
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': clearCookie() } });
    }

    if (request.method === 'POST' && url.pathname === '/api/issues') {
      if (!authed) return json({ error: 'Not logged in.' }, 401);
      if (!sameOrigin(request)) return json({ error: 'Bad origin.' }, 403);
      try {
        const { status, ...result } = await fileIssue(await request.formData(), env);
        return json(result, status);
      } catch (e) {
        console.error(e);
        return json({ error: `GitHub said no: ${e.message}` }, 502);
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
