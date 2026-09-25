import type { MiddlewareHandler } from 'hono';

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '[::1]']);

export function tailnetGuard(owner: string | null): MiddlewareHandler {
  return async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    const local = LOCAL_HOSTS.has(host) && !c.req.header('x-forwarded-for') && !c.req.header('x-forwarded-host');
    if (local) return next();
    const login = c.req.header('tailscale-user-login')?.toLowerCase();
    if (!owner) return c.json({ error: 'Remote access is off: set TERMINUS_OWNER_LOGIN to your Tailscale login' }, 403);
    if (login !== owner.toLowerCase()) return c.json({ error: 'Only the owner of this Terminus can reach it remotely' }, 403);
    return next();
  };
}
