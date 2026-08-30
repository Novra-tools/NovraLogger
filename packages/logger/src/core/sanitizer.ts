import type { SerializedError } from '../types';

/** Default sensitive field names (handled case-insensitively) */
const DEFAULT_SENSITIVE_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'token',
  'authorization',
  'password',
  'pwd',
  'secret',
  'secretkey',
  'apikey',
  'encryptionkey',
  'privatekey',
  'phone',
  'mobile',
  'email',
  'idcard',
  'creditcard',
]);

/** Sensitive field type-preserving mask tags to assist troubleshooting */
const DEFAULT_MASKS: Record<string, string> = {
  accesstoken: '[atoken]',
  refreshtoken: '[rtoken]',
  token: '[token]',
  authorization: '[auth]',
  password: '[password]',
  pwd: '[password]',
  secret: '[secret]',
  secretkey: '[secret]',
  apikey: '[apikey]',
  encryptionkey: '[e-key]',
  privatekey: '[private-key]',
  phone: '[phone]',
  mobile: '[phone]',
  email: '[email]',
  idcard: '[idcard]',
  creditcard: '[creditcard]',
};

/**
 * Sensitive data masking and sanitization utility
 */
export class LogSanitizer {
  private sensitiveKeys: Set<string>;
  private jsonRegex: RegExp;

  constructor(customSensitiveKeys: string[] = []) {
    this.sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS);
    for (const key of customSensitiveKeys) {
      if (key && typeof key === 'string') {
        this.sensitiveKeys.add(key.trim().toLowerCase());
      }
    }

    // Precompile regex for matching sensitive key-value pairs in JSON strings
    const keysPattern = Array.from(this.sensitiveKeys).join('|');
    this.jsonRegex = new RegExp(`("(${keysPattern})"\\s*:\\s*")[^"]*(")`, 'gi');
  }

  /**
   * Sanitize Bearer tokens, URL query parameters, and inline JSON in string messages
   */
  public sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') return text;

    return text
      // 1. Mask Bearer authorization headers
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [auth]')
      // 2. Mask sensitive query parameters in URLs
      .replace(/([?&](?:access_token|refresh_token|token|secret|apiKey)=)[^&\s]+/gi, '$1[token]')
      // 3. Mask sensitive keys in JSON string format
      .replace(this.jsonRegex, (_match, left: string, key: string, right: string) => {
        const lowerKey = key.toLowerCase();
        const mask = DEFAULT_MASKS[lowerKey] ?? '[masked]';
        return `${left}${mask}${right}`;
      });
  }

  /**
   * Normalize and sanitize an Error instance or error-like object into a SerializedError structure
   */
  public serializeError(error: unknown): SerializedError | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: this.sanitizeText(error.message),
        stack: error.stack ? this.sanitizeText(error.stack) : undefined,
      };
    }

    if (typeof error === 'object' && 'message' in error) {
      const message = String((error as { message?: unknown }).message ?? '');
      return { message: this.sanitizeText(message) };
    }

    return { message: this.sanitizeText(String(error)) };
  }

  /**
   * Recursively clean sensitive data from objects, arrays, and primitives with circular reference protection
   */
  public sanitizeValue(val: unknown, seen = new WeakSet()): unknown {
    if (val === undefined || val === null) return val;

    if (val instanceof Error) {
      return this.serializeError(val);
    }

    if (typeof val === 'string') {
      return this.sanitizeText(val);
    }

    if (typeof val === 'function') {
      return undefined;
    }

    if (typeof val !== 'object') {
      return val;
    }

    // Prevent circular reference call stack overflow
    if (seen.has(val as object)) {
      return '[Circular]';
    }
    seen.add(val as object);

    // Recursively process arrays
    if (Array.isArray(val)) {
      return val.map(item => this.sanitizeValue(item, seen));
    }

    // Recursively process plain objects
    const record = val as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveKeys.has(lowerKey)) {
        result[key] = DEFAULT_MASKS[lowerKey] ?? '[masked]';
      } else {
        result[key] = this.sanitizeValue(record[key], seen);
      }
    }

    return result;
  }

  /**
   * Serialize payload data to a safe, sanitized JSON string (with fallback to string conversion)
   */
  public stringify(data: unknown): string {
    if (data === undefined) return '';
    const safeData = this.sanitizeValue(data);
    if (typeof safeData === 'string') return safeData;

    try {
      return JSON.stringify(safeData);
    } catch {
      return String(safeData);
    }
  }
}

/** Default global singleton sanitizer instance */
export const defaultSanitizer = new LogSanitizer();

