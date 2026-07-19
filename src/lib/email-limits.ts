export const MAX_RECIPIENTS = 50;
export const MAX_HTML_BYTES = 1024 * 1024;

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
