export function compactTransactionCode(code: string) {
  if (code.length <= 20) return code;
  const length = Math.max(8, Math.round(code.length * 0.3));
  const prefix = Math.ceil((length - 1) * 0.6);
  return `${code.slice(0, prefix)}…${code.slice(-(length - prefix - 1))}`;
}
