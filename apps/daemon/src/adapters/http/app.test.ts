import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@terminus/contracts';
import { createHttpApp } from './app.js';

describe('GET /api/health', () => {
  it('answers with a valid health payload', async () => {
    const response = await createHttpApp('1.2.3').request('/api/health');

    expect(response.status).toBe(200);
    expect(HealthResponse.parse(await response.json())).toEqual({ status: 'ok', version: '1.2.3' });
  });
});
