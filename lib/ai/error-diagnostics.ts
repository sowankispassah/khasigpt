// SDK errors can contain request bodies, private image bytes and credentials.
// Log only classifications derived from them, never the error object itself.
export function safeAiErrorDiagnostics(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const name = typeof value.name === "string" && /^(AI_[A-Za-z]+Error|AbortError|TypeError|Error)$/.test(value.name) ? value.name : "UnknownError";
  const message = typeof value.message === "string" ? value.message.toLowerCase() : "";
  const statusCode = typeof value.statusCode === "number" && Number.isInteger(value.statusCode) && value.statusCode >= 100 && value.statusCode <= 599 ? value.statusCode : undefined;
  const category = /image|multimodal|vision/.test(message) ? "image-input" : /api.key|unauthoriz|authentication/.test(message) ? "authentication" : /quota|billing|rate.limit/.test(message) ? "capacity" : /timeout|timed.out/.test(message) ? "timeout" : /unsupported|not.support/.test(message) ? "unsupported-input" : /invalid|bad.request/.test(message) ? "invalid-request" : "generation";
  return { name, statusCode, category };
}
