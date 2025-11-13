type EventHandler = (event: { event?: string; data: string }) => void;
type ErrorHandler = (error: Error) => void;

export class SSEClient {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder("utf-8");
  private buffer = "";
  private onEvent?: EventHandler;
  private onError?: ErrorHandler;
  private closed = false;

  constructor(
    private response: Response,
    handlers: { onEvent: EventHandler; onError?: ErrorHandler }
  ) {
    this.onEvent = handlers.onEvent;
    this.onError = handlers.onError;
  }

  async start() {
    if (!this.response.body) {
      throw new Error("Missing SSE body");
    }
    this.reader = this.response.body.getReader();
    try {
      while (!this.closed) {
        const chunk = await this.reader.read();
        if (chunk.done) {
          break;
        }
        this.buffer += this.decoder.decode(chunk.value, { stream: true });
        this.processBuffer();
      }
    } catch (error) {
      this.onError?.(
        error instanceof Error ? error : new Error("Unknown SSE error")
      );
    } finally {
      this.reader?.releaseLock();
      this.closed = true;
    }
  }

  close() {
    this.closed = true;
    if (this.reader) {
      this.reader.cancel().catch(() => {
        // noop
      });
    }
  }

  private processBuffer() {
    const segments = this.buffer.split("\n\n");
    this.buffer = segments.pop() ?? "";

    for (const segment of segments) {
      const lines = segment.split("\n");
      const eventPayload: { event?: string; data: string[] } = {
        data: [],
      };

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventPayload.event = line.replace("event:", "").trim();
        } else if (line.startsWith("data:")) {
          eventPayload.data.push(line.replace("data:", "").trim());
        }
      }

      if (eventPayload.data.length > 0) {
        this.onEvent?.({
          event: eventPayload.event,
          data: eventPayload.data.join("\n"),
        });
      }
    }
  }
}
