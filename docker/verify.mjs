import assert from 'node:assert/strict';
import { get } from 'node:http';

// Solo contra el stack efimero de verificacion; usa el ADMIN creado por la CI.
assert.ok(process.env.POSTGRES_DB?.endsWith('_test'), 'Se requiere una base _test');
assert.ok(process.env.ADMIN_PASSWORD, 'Se requiere ADMIN_PASSWORD');

const api = 'http://backend:3000/api';
const origin = process.env.FRONTEND_URL;
const health = await fetch(`${api}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).data.database, 'up');

// La conexion usa DNS interno; Host reproduce el acceso del navegador por localhost.
// Vite sigue rechazando hosts arbitrarios. node:http permite enviar este Host.
const page = await new Promise((resolve, reject) => {
  const request = get(
    'http://frontend:5173',
    { headers: { Host: 'localhost:5173' } },
    (response) => {
      let html = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (html += chunk));
      response.on('end', () => resolve({ status: response.statusCode, html }));
      response.on('error', reject);
    },
  );
  request.on('error', reject);
  request.setTimeout(10000, () => request.destroy(new Error('Frontend no responde')));
});
assert.equal(page.status, 200);
assert.match(page.html, /@vite\/client/);

const preflight = await fetch(`${api}/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});
assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

const login = await fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.ok(login.ok, `Login fallo con HTTP ${login.status}`);
const cookieHeader = login.headers.getSetCookie().find((value) => value.includes('HttpOnly'));
assert.ok(cookieHeader, 'Falta la cookie HttpOnly');
assert.match(cookieHeader, /SameSite=Strict/i);
assert.doesNotMatch(cookieHeader, /;\s*Secure/i, 'El desarrollo HTTP debe poder usar la cookie');
const Cookie = cookieHeader.split(';')[0];

for (const route of [
  '/auth/me',
  '/users',
  '/products',
  '/warehouses',
  '/suppliers',
  '/customers',
]) {
  const authenticated = await fetch(`${api}${route}`, { headers: { Cookie, Origin: origin } });
  assert.equal(authenticated.status, 200, route);
  const unauthenticated = await fetch(`${api}${route}`);
  assert.equal(unauthenticated.status, 401, `${route} debe exigir sesion`);
}

const logout = await fetch(`${api}/auth/logout`, {
  method: 'POST',
  headers: { Cookie, Origin: origin },
});
assert.ok(logout.ok);
const revoked = await fetch(`${api}/auth/me`, { headers: { Cookie } });
assert.equal(revoked.status, 401);
console.log('Docker: frontend, salud, CORS, cookie, cuatro catalogos y logout verificados.');
