// Generates public/sample-trace.json from a real kernelee run (KernelBuilder + defineState +
// BufferBuilder + compose/fork/dispatch), not hand-written JSON — same convention as
// generate-sample-catalog.mjs. Reimplements connector.ts's bufferSnapshot-embedding logic
// (JSON.stringify -> String() fallback, 1024-char cap) locally since this script produces
// `BridgeTraceEntry`-shaped records directly rather than going through the bridge itself.
//
// Deliberately uses only ordinary top-level calls (`kernel.compose`/`kernel.dispatch`) — even
// fork branches and sequential pipe stages within one top-level `compose()` call always come
// out as independent roots (`parentId === undefined`), a genuine Swift-TS parity (not a TS-only
// gap: swift-kernelee's own `compose`/`fork` have no `traced()` wrapper of their own either).
// So this sample is honestly flat — no fake nesting is manufactured via the semi-internal
// `kernel.runStages(..., parentSpan)` escape hatch, since no real app reaches for that either.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferBuilder, KernelBuilder, defineState, next, pipeline, symbol } from '@s-age/kernelee';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUFFER_VALUE_CAP = 1024;
function describeCellValue(value) {
  let text;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > BUFFER_VALUE_CAP ? `${text.slice(0, BUFFER_VALUE_CAP)}…` : text;
}

const CounterState = defineState('sample-trace/CounterState', 0);
const watchBuffers = [{ label: 'invokeCount', key: CounterState }];

const bufferBuilder = new BufferBuilder();
bufferBuilder.allocate(CounterState);

const entries = [];

const receiveOrder = symbol('demo.receiveOrder', 'Receive an order');
const priceOrder = symbol('demo.priceOrder', 'Calculate the price');
const notifyEmail = symbol('demo.notifyEmail', 'Notify by email');
const notifySms = symbol('demo.notifySms', 'Notify by SMS');
const restock = symbol('demo.restock', 'Restock wait');

const checkoutPipe = pipeline(receiveOrder)
  .pipe(priceOrder)
  .fork(pipeline(notifyEmail), pipeline(notifySms))
  .seal();

const builder = new KernelBuilder();
const countUp = async (kernel, value) => {
  kernel.buffer.mutate(CounterState, (n) => n + 1);
  return next(value);
};
builder.register(receiveOrder, countUp);
builder.register(priceOrder, async (kernel, value) => {
  kernel.buffer.mutate(CounterState, (n) => n + 1);
  return next({ ...value, price: 42 });
});
builder.register(notifyEmail, countUp);
builder.register(notifySms, countUp);
builder.register(restock, countUp);

const kernel = builder.build({
  tracing: true,
  buffer: bufferBuilder,
  onTrace: (symbolId, verb, span, payload, timestamp) => {
    const bufferSnapshot = watchBuffers.map(({ label, key }) => ({
      label,
      value: describeCellValue(kernel.buffer.getSnapshot(key)),
    }));
    entries.push({ symbolId, verb, span, payload, timestamp, bufferSnapshot });
  },
});

// A normal checkout flow (sequential stages + a fork) — every resulting entry is its own root
// (both Swift and TS produce flat siblings here; this is not this script under-using the
// framework).
await kernel.compose(checkoutPipe, { orderId: 'ord-1' });
// A second, independent flow shortly after, so the sample timeline has more than one root to
// scroll through.
kernel.dispatch(restock, { orderId: 'ord-2' });
await new Promise((resolve) => setTimeout(resolve, 0));

const outPath = join(__dirname, '..', 'public', 'sample-trace.json');
await writeFile(outPath, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`wrote ${outPath} (${entries.length} entries)`);
