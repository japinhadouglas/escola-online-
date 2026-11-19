const base = 'http://localhost:3000/api/v1';
const RA = '1135791089SP';
const SENHA = 'Valeria@123';

async function post(url, body, headers) {
  const r = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function get(url, headers) {
  const r = await fetch(base + url, { headers: headers || {} });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async () => {
  const login = await post('/auth/login', { identifier: RA, password: SENHA, role: 'student' });
  console.log('LOGIN', login.status, login.json.user ? `=> ${login.json.user.name}` : JSON.stringify(login.json).slice(0, 200));
  if (login.status !== 200) process.exit(1);
  const token = login.json.token;
  const hasSed = !!login.json.user.sedToken;

  const t0 = Date.now();
  const tar = await get('/tarefas', { Authorization: `Bearer ${token}` });
  console.log('TAREFAS', tar.status, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(JSON.stringify(tar.json, null, 2));
})();