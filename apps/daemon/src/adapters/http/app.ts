import { Hono } from 'hono';
import type { HealthResponse } from '@terminus/contracts';

export function createHttpApp(version: string): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json<HealthResponse>({ status: 'ok', version }));
  return app;
}
