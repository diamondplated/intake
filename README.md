# intake

A tiny site where Emily (or anyone with the passcode) picks a project, drops in screenshots and a description, and it lands as a GitHub issue on that project's repo, labeled `from-intake` plus `bug` or `enhancement`.

One Cloudflare Worker, no database.

## How it works

- `GET /` shows a passcode screen, then the form. Login is a signed cookie good for 30 days.
- `POST /api/issues` validates the form, uploads each screenshot to an orphan `intake-screenshots` branch in the target repo, and opens an issue that embeds them. GitHub has no issue-attachment API, so this is how images show up on private repos without a third-party bucket.
- Projects are a hardcoded list in [`src/projects.js`](src/projects.js). Edit it and redeploy.

## Setup

1. Make a fine-grained GitHub token at https://github.com/settings/personal-access-tokens/new
   - Repository access: only the repos in `src/projects.js`
   - Permissions: **Issues** read/write, **Contents** read/write (Metadata read is automatic)
2. Install and log in to Cloudflare:
   ```sh
   npm install
   npx wrangler login
   ```
3. Set the secrets:
   ```sh
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put PASSCODE          # what Emily types
   npx wrangler secret put SESSION_SECRET    # e.g. `openssl rand -base64 32`
   ```
4. Deploy: `npm run deploy`. It prints a `https://intake.<you>.workers.dev` URL. Send that and the passcode to Emily.

Adding a project: add a line to `src/projects.js`, add the repo to the token's access list, `npm run deploy`.

Changing the passcode: `npx wrangler secret put PASSCODE`. To kick everyone out too, also rotate `SESSION_SECRET`.

## Local dev

```sh
printf 'PASSCODE=dev\nSESSION_SECRET=dev\nGITHUB_TOKEN=<token>\n' > .dev.vars
npm run dev     # http://localhost:8787
npm test        # unit tests against a fake GitHub API
```

## Picking up issues

Everything filed here is labeled `from-intake`, so `is:issue is:open label:from-intake` finds the queue on any repo.
