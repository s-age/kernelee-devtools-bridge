export function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', (event) => reject(event), { once: true });
  });
}

export function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.addEventListener(
      'message',
      (event) => resolve(JSON.parse(event.data as string)),
      { once: true },
    );
  });
}

/**
 * Like {@link waitForMessage}, but resolves the raw `event.data` text without `JSON.parse`ing it —
 * needed for byte-identity assertions (`toBe`/`===` on the exact wire text), since `JSON.parse`
 * followed by re-comparison would not catch a change in key order or whitespace, and there is no
 * way to recover the original text once it has been parsed.
 */
export function waitForRawMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.addEventListener(
      'message',
      (event) => resolve(event.data as string),
      { once: true },
    );
  });
}

/** Collects every message received over a fixed window — for asserting on counts/contents, not just the next one. */
export function collectMessages(ws: WebSocket, durationMs: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    const handler = (event: MessageEvent) => messages.push(JSON.parse(event.data as string));
    ws.addEventListener('message', handler);
    setTimeout(() => {
      ws.removeEventListener('message', handler);
      resolve(messages);
    }, durationMs);
  });
}
