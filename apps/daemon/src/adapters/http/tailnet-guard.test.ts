import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { tailnetGuard } from './tailnet-guard.js';

function app(owner: string | null): Hono {
  const hono = new Hono();
  hono.use('*', tailnetGuard(owner));
  hono.get('/api/health', (c) => c.json({ status: 'ok' }));
  return hono;
}

const get = (hono: Hono, headers: Record<string, string>) => hono.request('http://localhost:4317/api/health', { headers });

describe('tailnetGuard', () => {
  it('lets local requests through', async () => {
    expect((await get(app(null), { host: 'localhost:4317' })).status).toBe(200);
    expect((await get(app(null), { host: '127.0.0.1:4317' })).status).toBe(200);
  });

  it('lets only the owner through Tailscale Serve', async () => {
    const serve = { host: 'pc.tail77de2b.ts.net', 'x-forwarded-for': '100.64.0.7' };
    expect((await get(app('me@example.com'), { ...serve, 'tailscale-user-login': 'Me@Example.com' })).status).toBe(200);
    expect((await get(app('me@example.com'), { ...serve, 'tailscale-user-login': 'guest@example.com' })).status).toBe(403);
    expect((await get(app('me@example.com'), serve)).status).toBe(403);
  });

  it('refuses a proxied request even on a local host name, and every remote one when no owner is set', async () => {
    expect((await get(app('me@example.com'), { host: 'localhost:4317', 'x-forwarded-for': '100.64.0.7' })).status).toBe(403);
    const refused = await get(app(null), { host: 'pc.tail77de2b.ts.net', 'tailscale-user-login': 'me@example.com' });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'Remote access is off: set TERMINUS_OWNER_LOGIN to your Tailscale login' });
  });
});
