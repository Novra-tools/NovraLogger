import { describe, expect, it, vi } from 'vitest';
import { createRendererLogger } from '../src/renderer';
import type { RendererLogPayload } from '../src/types';

describe('RendererLogger', () => {
  it('should dispatch log payload via send callback', () => {
    const sendFn = vi.fn();
    const rendererLogger = createRendererLogger({
      send: sendFn,
      defaultModule: 'ui',
      getUserId: () => 'user_123',
      getTenantId: () => 'tenant_abc',
      enableConsole: false,
    });

    rendererLogger.info('Click button', { btnId: 'submit' });

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: RendererLogPayload = sendFn.mock.calls[0][0];
    expect(payload.level).toBe('info');
    expect(payload.module).toBe('ui');
    expect(payload.message).toBe('Click button');
    expect(payload.userId).toBe('user_123');
    expect(payload.tenantId).toBe('tenant_abc');
    expect(payload.data).toEqual({ btnId: 'submit' });
  });

  it('should handle scoped renderer logs and error serialization', () => {
    const sendFn = vi.fn();
    const rendererLogger = createRendererLogger({
      send: sendFn,
      enableConsole: false,
    });

    const scoped = rendererLogger.scope('ContactPanel', 'fetchList');
    scoped.error('Failed to load contacts', new Error('Network timeout'));

    expect(sendFn).toHaveBeenCalledTimes(1);
    const payload: RendererLogPayload = sendFn.mock.calls[0][0];
    expect(payload.level).toBe('error');
    expect(payload.module).toBe('ContactPanel');
    expect(payload.method).toBe('fetchList');
    expect(payload.error?.message).toBe('Network timeout');
  });
});
