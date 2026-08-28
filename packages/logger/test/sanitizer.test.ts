import { describe, expect, it } from 'vitest';
import { LogSanitizer } from '../src/core/sanitizer';

describe('LogSanitizer', () => {
  const sanitizer = new LogSanitizer();

  it('should mask bearer token in text', () => {
    const raw = 'Request header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI...';
    const result = sanitizer.sanitizeText(raw);
    expect(result).toBe('Request header: Authorization: Bearer [auth]');
  });

  it('should mask url query tokens', () => {
    const raw = 'https://api.example.com/v1/user?token=abc123456&other=value';
    const result = sanitizer.sanitizeText(raw);
    expect(result).toBe('https://api.example.com/v1/user?token=[token]&other=value');
  });

  it('should mask sensitive keys in inline JSON string', () => {
    const raw = 'User login payload: {"password":"mySecretPassword123","email":"test@example.com"}';
    const result = sanitizer.sanitizeText(raw);
    expect(result).toContain('"password":"[password]"');
    expect(result).toContain('"email":"[email]"');
  });

  it('should recursively mask sensitive keys in objects', () => {
    const obj = {
      username: 'alex',
      password: 'password123',
      nested: {
        token: 'token_val',
        phone: '13800138000',
        normalKey: 'normalValue',
      },
    };
    const cleaned = sanitizer.sanitizeValue(obj) as typeof obj;
    expect(cleaned.username).toBe('alex');
    expect(cleaned.password).toBe('[password]');
    expect(cleaned.nested.token).toBe('[token]');
    expect(cleaned.nested.phone).toBe('[phone]');
    expect(cleaned.nested.normalKey).toBe('normalValue');
  });

  it('should handle circular references safely without throwing', () => {
    const circularObj: Record<string, unknown> = {
      name: 'root',
    };
    circularObj.self = circularObj;

    expect(() => {
      const stringified = sanitizer.stringify(circularObj);
      expect(stringified).toContain('[Circular]');
    }).not.toThrow();
  });

  it('should serialize Error instances safely', () => {
    const err = new Error('Database connection failed with password=123');
    const serialized = sanitizer.serializeError(err);
    expect(serialized).toBeDefined();
    expect(serialized?.name).toBe('Error');
    expect(serialized?.message).toContain('Database connection failed with');
  });
});
