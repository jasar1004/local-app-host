import { buildPushPayload } from '@block65/webcrypto-web-push';

const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_DUE_PER_RUN = 5;

function headersFor(request, env) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  });
  const origin = request.headers.get('Origin');
  if (origin && origin === env.ALLOWED_ORIGIN) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(request, env, value, status = 200) {
  const headers = headersFor(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(value), { status, headers });
}

function allowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || origin === env.ALLOWED_ORIGIN;
}

function tokenFrom(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  return match ? match[1] : '';
}

async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function authorizedDevice(request, env) {
  const token = tokenFrom(request);
  if (!token) return null;
  return env.DB.prepare('SELECT id FROM devices WHERE token_hash = ?')
    .bind(await tokenHash(token)).first();
}

function safeText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    if (!allowed(request, env)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: headersFor(request, env) });
  }
  if (!allowed(request, env)) return json(request, env, { error: 'Origin not allowed.' }, 403);

  if (request.method === 'GET' && url.pathname === '/api/public-key') {
    if (!env.VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY.startsWith('REPLACE_')) {
      return json(request, env, { error: 'VAPID public key is not configured.' }, 503);
    }
    return json(request, env, { publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (request.method === 'POST' && url.pathname === '/api/subscribe') {
    let body;
    try { body = await request.json(); } catch { return json(request, env, { error: 'Invalid JSON.' }, 400); }
    const subscription = body?.subscription;
    if (!subscription?.endpoint?.startsWith('https://') || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return json(request, env, { error: 'A valid Web Push subscription is required.' }, 400);
    }
    let device = null;
    if (body.deviceId && body.token) {
      device = await env.DB.prepare('SELECT id FROM devices WHERE id = ? AND token_hash = ?')
        .bind(String(body.deviceId), await tokenHash(String(body.token))).first();
    }
    if (device) {
      await env.DB.prepare('UPDATE devices SET subscription = ? WHERE id = ?')
        .bind(JSON.stringify(subscription), device.id).run();
      return json(request, env, { deviceId: device.id, token: String(body.token) });
    }
    const id = crypto.randomUUID(), token = randomToken();
    await env.DB.prepare('INSERT INTO devices (id, token_hash, subscription, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, await tokenHash(token), JSON.stringify(subscription), Date.now()).run();
    return json(request, env, { deviceId: id, token });
  }

  if (request.method === 'POST' && url.pathname === '/api/reminders') {
    const device = await authorizedDevice(request, env);
    if (!device) return json(request, env, { error: 'Notifications are not enabled for this device.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json(request, env, { error: 'Invalid JSON.' }, 400); }
    const appId = safeText(body?.appId, 100), appName = safeText(body?.appName, 80);
    const reminderId = safeText(body?.reminderId, 120), title = safeText(body?.title, 120);
    const message = safeText(body?.body, 300), fireAt = Number(body?.fireAt), now = Date.now();
    if (!appId || !reminderId || !title || !Number.isFinite(fireAt) || fireAt <= now || fireAt > now + MAX_FUTURE_MS) {
      return json(request, env, { error: 'Provide an app, reminder ID, title, and a future time within one year.' }, 400);
    }
    const existing = await env.DB.prepare('SELECT 1 AS found FROM reminders WHERE device_id = ? AND app_id = ? AND reminder_id = ?')
      .bind(device.id, appId, reminderId).first();
    if (!existing) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM reminders WHERE device_id = ?').bind(device.id).first();
      if ((count?.total || 0) >= 100) return json(request, env, { error: 'This device already has 100 scheduled reminders.' }, 429);
    }
    await env.DB.prepare(`INSERT INTO reminders (device_id, app_id, reminder_id, app_name, title, body, fire_at, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(device_id, app_id, reminder_id) DO UPDATE SET
        app_name = excluded.app_name, title = excluded.title, body = excluded.body,
        fire_at = excluded.fire_at, attempts = 0`)
      .bind(device.id, appId, reminderId, appName || 'Local App Host', title, message, Math.floor(fireAt)).run();
    return json(request, env, { ok: true, reminderId, fireAt: Math.floor(fireAt) }, 201);
  }

  if (request.method === 'DELETE' && url.pathname === '/api/reminders') {
    const device = await authorizedDevice(request, env);
    if (!device) return json(request, env, { error: 'Notifications are not enabled for this device.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json(request, env, { error: 'Invalid JSON.' }, 400); }
    const appId = safeText(body?.appId, 100), reminderId = safeText(body?.reminderId, 120);
    if (!appId) return json(request, env, { error: 'An app ID is required.' }, 400);
    if (reminderId) {
      await env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND app_id = ? AND reminder_id = ?')
        .bind(device.id, appId, reminderId).run();
    } else {
      await env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND app_id = ?').bind(device.id, appId).run();
    }
    return json(request, env, { ok: true });
  }

  if (request.method === 'DELETE' && url.pathname === '/api/subscribe') {
    const device = await authorizedDevice(request, env);
    if (!device) return json(request, env, { error: 'Notifications are not enabled for this device.' }, 401);
    await env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(device.id).run();
    await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(device.id).run();
    return json(request, env, { ok: true });
  }

  return json(request, env, { error: 'Not found.' }, 404);
}

async function sendDueReminders(env) {
  const now = Date.now();
  const { results = [] } = await env.DB.prepare(`SELECT r.device_id, r.app_id, r.reminder_id, r.app_name,
      r.title, r.body, r.fire_at, r.attempts, d.subscription
    FROM reminders r JOIN devices d ON d.id = r.device_id
    WHERE r.fire_at <= ? ORDER BY r.fire_at LIMIT ?`)
    .bind(now, MAX_DUE_PER_RUN).all();

  for (const reminder of results) {
    try {
      const subscription = JSON.parse(reminder.subscription);
      const message = {
        data: JSON.stringify({
          title: reminder.title,
          body: reminder.body,
          appName: reminder.app_name,
          appId: reminder.app_id,
          reminderId: reminder.reminder_id
        }),
        options: { ttl: 3600, urgency: 'normal' }
      };
      const vapid = {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY
      };
      const push = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(subscription.endpoint, push);
      if (response.ok) {
        await env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND app_id = ? AND reminder_id = ?')
          .bind(reminder.device_id, reminder.app_id, reminder.reminder_id).run();
      } else if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(reminder.device_id).run();
        await env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(reminder.device_id).run();
      } else {
        await retryOrRemove(env, reminder, now);
      }
    } catch {
      await retryOrRemove(env, reminder, now);
    }
  }
}

async function retryOrRemove(env, reminder, now) {
  const attempts = reminder.attempts + 1;
  if (attempts >= 5) {
    await env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND app_id = ? AND reminder_id = ?')
      .bind(reminder.device_id, reminder.app_id, reminder.reminder_id).run();
    return;
  }
  await env.DB.prepare(`UPDATE reminders SET attempts = ?, fire_at = ?
    WHERE device_id = ? AND app_id = ? AND reminder_id = ?`)
    .bind(attempts, now + 5 * 60 * 1000, reminder.device_id, reminder.app_id, reminder.reminder_id).run();
}

export default {
  fetch: handleRequest,
  async scheduled(_controller, env) {
    await sendDueReminders(env);
  }
};
