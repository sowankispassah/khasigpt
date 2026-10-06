// Count actual stream bytes; Content-Length is only an early rejection hint.
export class RequestBodyLimitError extends Error {}

export async function readBoundedBody(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw new RequestBodyLimitError();
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new RequestBodyLimitError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  return JSON.parse(
    (await readBoundedBody(request, maxBytes)).toString("utf8"),
  );
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const body = await readBoundedBody(request, maxBytes);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}

export function requestLimitResponse() {
  // Existing client-owned bad-request copy is already localized on both apps.
  return Response.json(
    {
      code: "bad_request:api",
      message:
        "The request couldn't be processed. Please check your input and try again.",
    },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}
