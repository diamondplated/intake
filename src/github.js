import { Buffer } from 'node:buffer';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function gh(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'intake-worker',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GitHubError(res.status, `${method} ${path}: ${res.status} ${data.message || ''}`.trim());
  return data;
}

export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

// The screenshot branch is an orphan so it never touches the repo's real history.
export async function ensureBranch(token, repo, branch) {
  try {
    await gh(token, 'GET', `/repos/${repo}/git/ref/heads/${branch}`);
    return;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const readme = `# ${branch}\n\nScreenshots uploaded through the intake site. Linked from issues; don't merge this branch.\n`;
  const blob = await gh(token, 'POST', `/repos/${repo}/git/blobs`, { content: toBase64(new TextEncoder().encode(readme)), encoding: 'base64' });
  const tree = await gh(token, 'POST', `/repos/${repo}/git/trees`, { tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await gh(token, 'POST', `/repos/${repo}/git/commits`, { message: 'Start intake screenshots branch', tree: tree.sha, parents: [] });
  try {
    await gh(token, 'POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  } catch (e) {
    // Someone else created it between our check and now; that's fine.
    if (e.status !== 422) throw e;
  }
}

export async function uploadFile(token, repo, branch, path, bytes) {
  await gh(token, 'PUT', `/repos/${repo}/contents/${path}`, {
    message: `Add ${path.split('/').pop()}`,
    content: toBase64(bytes),
    branch,
  });
  // ?raw=true renders inline in issues, including on private repos for anyone with access.
  return `https://github.com/${repo}/blob/${branch}/${path}?raw=true`;
}

export async function createIssue(token, repo, { title, body, labels }) {
  try {
    return await gh(token, 'POST', `/repos/${repo}/issues`, { title, body, labels });
  } catch (e) {
    // Don't lose a report over labels; file it bare instead.
    if (e.status !== 422 || !labels?.length) throw e;
    return gh(token, 'POST', `/repos/${repo}/issues`, { title, body: `${body}\n\n_Labels that failed to apply: ${labels.join(', ')}_` });
  }
}
