import type { SerializedError } from '../types';

/** 默认敏感字段名称集合（大小写不敏感处理） */
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

/** 敏感字段专属掩码标记，保留字段类型线索以辅助故障诊断 */
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
 * 敏感数据脱敏与数据清洗器
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

    // 预编译用于匹配 JSON 字符串中敏感键值对的正则表达式
    const keysPattern = Array.from(this.sensitiveKeys).join('|');
    this.jsonRegex = new RegExp(`("(${keysPattern})"\\s*:\\s*")[^"]*(")`, 'gi');
  }

  /**
   * 清理字符串文本中的认证头部、URL 参数及内联 JSON 敏感信息
   */
  public sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') return text;

    return text
      // 1. 过滤 Bearer Token 授权头
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [auth]')
      // 2. 过滤 URL 查询参数中的敏感 token
      .replace(/([?&](?:access_token|refresh_token|token|secret|apiKey)=)[^&\s]+/gi, '$1[token]')
      // 3. 过滤 JSON 字符串格式的敏感字段
      .replace(this.jsonRegex, (_match, left: string, key: string, right: string) => {
        const lowerKey = key.toLowerCase();
        const mask = DEFAULT_MASKS[lowerKey] ?? '[masked]';
        return `${left}${mask}${right}`;
      });
  }

  /**
   * 将任意 Error 实例或包含错误信息的对象转化为标准化且已脱敏的 SerializedError 结构
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
   * 递归清理任意对象、数组或基础类型中的敏感数据，并防范循环引用
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

    // 防止循环引用导致调用栈溢出
    if (seen.has(val as object)) {
      return '[Circular]';
    }
    seen.add(val as object);

    // 递归处理数组
    if (Array.isArray(val)) {
      return val.map(item => this.sanitizeValue(item, seen));
    }

    // 递归处理普通对象
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
   * 将任意附加数据序列化为安全、脱敏的 JSON 字符串（无法序列化时回退至字符串转换）
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

/** 默认的全局单例脱敏器实例 */
export const defaultSanitizer = new LogSanitizer();
