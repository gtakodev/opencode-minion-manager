const SECRET_KEYS =
  /(?:authorization|api[-_]?key|token|secret|password|credential)/i;

export function redact(value: unknown, patterns: string[] = []): unknown {
  if (typeof value === "string") {
    let output = value.replace(
      /(?:Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,
      "Bearer [REDACTED]",
    );
    for (const pattern of patterns)
      output = output.replaceAll(pattern, "[REDACTED]");
    return output;
  }
  if (Array.isArray(value))
    return value.map((entry) => redact(entry, patterns));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEYS.test(key) ? "[REDACTED]" : redact(entry, patterns),
      ]),
    );
  }
  return value;
}
