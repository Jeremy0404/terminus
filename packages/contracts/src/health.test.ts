import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.js';

describe('HealthResponse', () => {
  it('accepts a healthy payload', () => {
    expect(HealthResponse.parse({ status: 'ok', version: '0.1.0' })).toEqual({
      status: 'ok',
      version: '0.1.0',
    });
  });

  it('rejects any other status', () => {
    expect(HealthResponse.safeParse({ status: 'degraded', version: '0.1.0' }).success).toBe(false);
  });
});
