const REDACTED = "[REDACTED]";

const sensitiveKeyFragments = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "clientsecret",
  "sessionsecret",
  "credentials",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized === "sessionid" || normalized === "requestid" || normalized === "characterid") {
    return false;
  }
  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

export function sanitizeString(value: string): string {
  return value
    .replace(/\b(authorization\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b(cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(
      /\b(password|passwd|pwd|token|secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?(?:token|secret)|api[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^\s,"';}&]+["']?/gi,
      "$1=[REDACTED]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, "$1[REDACTED]@");
}

export function sanitizeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[FUNCTION]";
  if (typeof value === "symbol") return value.toString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (Array.isArray(value)) {
      const sanitized = value.map((entry) => sanitizeValue(entry, seen));
      seen.delete(value);
      return sanitized;
    }

    const source = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(entry, seen);
    }
    seen.delete(value);
    return sanitized;
  }

  return sanitizeString(String(value));
}

export function sanitizeRecord<T>(value: T): T {
  return sanitizeValue(value) as T;
}

export { REDACTED };
