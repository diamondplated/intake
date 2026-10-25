const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root { --bg:#f6f5f2; --card:#fff; --text:#1c1b19; --muted:#6b6862; --line:#e2dfd8; --accent:#2f5bd3; --accent-text:#fff; --err:#b3261e; --ok:#1e7a3c; }
@media (prefers-color-scheme: dark) { :root { --bg:#161513; --card:#201f1c; --text:#ece9e3; --muted:#9a968e; --line:#34322d; --accent:#7c9cff; --accent-text:#0d1330; --err:#ff8a80; --ok:#7bd88f; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width:560px; margin:0 auto; padding:32px 16px 64px; }
h1 { font-size:24px; margin:0 0 4px; }
p.sub { color:var(--muted); margin:0 0 24px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; }
label { display:block; font-weight:600; font-size:14px; margin:16px 0 6px; }
label:first-child { margin-top:0; }
input[type=text], input[type=password], select, textarea { width:100%; font:inherit; color:inherit; background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
textarea { min-height:120px; resize:vertical; }
.seg { display:flex; gap:8px; }
.seg label { flex:1; margin:0; font-weight:500; text-align:center; border:1px solid var(--line); border-radius:10px; padding:10px; cursor:pointer; }
.seg input { position:absolute; opacity:0; pointer-events:none; }
.seg label:has(input:checked) { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; }
.drop { border:2px dashed var(--line); border-radius:12px; padding:18px; text-align:center; color:var(--muted); cursor:pointer; }
.drop.over { border-color:var(--accent); color:var(--text); }
.thumbs { display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px; margin-top:10px; }
.thumb { position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; border:1px solid var(--line); }
.thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.thumb button { position:absolute; top:4px; right:4px; width:24px; height:24px; border-radius:12px; border:0; background:rgba(0,0,0,.65); color:#fff; cursor:pointer; line-height:24px; padding:0; }
button.primary { width:100%; margin-top:20px; font:inherit; font-weight:600; background:var(--accent); color:var(--accent-text); border:0; border-radius:10px; padding:12px; cursor:pointer; }
button.primary:disabled { opacity:.6; cursor:wait; }
.msg { margin-top:14px; font-size:15px; }
.msg.err { color:var(--err); } .msg.ok { color:var(--ok); }
.msg a { color:inherit; }
.foot { margin-top:16px; text-align:center; }
.foot button { background:none; border:0; color:var(--muted); font:inherit; font-size:14px; cursor:pointer; text-decoration:underline; }
`;

const shell = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;

export function loginPage(error = '') {
  return shell('Report a bug', `
<h1>Report a bug</h1>
<p class="sub">Enter the passcode to get in.</p>
<form class="card" method="post" action="/login">
  <label for="passcode">Passcode</label>
  <input id="passcode" name="passcode" type="password" autocomplete="current-password" autofocus required>
  <button class="primary" type="submit">Continue</button>
  ${error ? `<div class="msg err">${esc(error)}</div>` : ''}
</form>`);
}

export function formPage(projects, { maxFiles }) {
  const options = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  return shell('Report a bug', `
<h1>Report a bug or idea</h1>
<p class="sub">It goes straight into the project's GitHub issues.</p>
<form class="card" id="f">
  <label for="project">Project</label>
  <select id="project" name="project" required><option value="" disabled selected>Pick one…</option>${options}</select>

  <label>What is it?</label>
  <div class="seg">
    <label><input type="radio" name="kind" value="bug" checked>🐛 Bug</label>
    <label><input type="radio" name="kind" value="feature">✨ Feature idea</label>
  </div>

  <label for="title">Short summary</label>
  <input id="title" name="title" type="text" maxlength="200" placeholder="Checkout button does nothing" required>

  <label for="description">Details</label>
  <textarea id="description" name="description" placeholder="What did you do, what happened, what did you expect?"></textarea>

  <label>Screenshots</label>
  <div class="drop" id="drop">Tap to add, drag in, or paste (⌘V / Ctrl+V)</div>
  <input id="file" type="file" accept="image/*" multiple hidden>
  <div class="thumbs" id="thumbs"></div>

  <label for="reporter">Your name</label>
  <input id="reporter" name="reporter" type="text" maxlength="80" placeholder="Emily">

  <button class="primary" id="go" type="submit">Send it</button>
  <div class="msg" id="msg" role="status"></div>
</form>
<form class="foot" method="post" action="/logout"><button type="submit">Log out</button></form>
<script>
const MAX = ${Number(maxFiles)};
const files = [];
const $ = (id) => document.getElementById(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
$('reporter').value = store.get('reporter') || '';
const last = store.get('project'); if (last && [...$('project').options].some(o => o.value === last)) $('project').value = last;

function render() {
  $('thumbs').innerHTML = '';
  files.forEach((f, i) => {
    const d = document.createElement('div'); d.className = 'thumb';
    const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.alt = f.name;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove');
    x.onclick = () => { files.splice(i, 1); render(); };
    d.append(img, x); $('thumbs').append(d);
  });
}
function add(list) {
  for (const f of list) {
    if (!f.type.startsWith('image/')) continue;
    if (files.length >= MAX) { say('Max ' + MAX + ' screenshots.', 'err'); break; }
    files.push(f.name ? f : new File([f], 'pasted.png', { type: f.type }));
  }
  render();
}
function say(text, cls, href) {
  const m = $('msg'); m.className = 'msg ' + (cls || ''); m.textContent = text;
  if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'View on GitHub'; m.append(' ', a); }
}
$('drop').onclick = () => $('file').click();
$('file').onchange = (e) => { add(e.target.files); e.target.value = ''; };
['dragenter', 'dragover'].forEach(t => $('drop').addEventListener(t, (e) => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(t => $('drop').addEventListener(t, (e) => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', (e) => add(e.dataTransfer.files));
document.addEventListener('paste', (e) => { const imgs = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); add(imgs); } });

$('f').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData($('f'));
  files.forEach(f => fd.append('screenshots', f));
  store.set('reporter', $('reporter').value); store.set('project', $('project').value);
  $('go').disabled = true; say('Sending…');
  try {
    const res = await fetch('/api/issues', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({ error: 'Server error (' + res.status + ').' }));
    if (res.status === 401) { location.reload(); return; }
    if (!res.ok) throw new Error(data.error);
    say('Filed as #' + data.number + ' in ' + data.project + '. Thanks!', 'ok', data.url);
    $('title').value = ''; $('description').value = ''; files.length = 0; render();
  } catch (err) { say(err.message || 'Something broke.', 'err'); }
  finally { $('go').disabled = false; }
};
</script>`);
}
