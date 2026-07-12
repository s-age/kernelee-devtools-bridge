// Generates public/sample-catalog.json from real kernelee pipeline/fork/defineCallable
// wiring (via describePipe/projectWiringGraph), not hand-written JSON — so the panel's
// dummy-data fallback exercises the exact same schema real apps produce.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KernelBuilder,
  defineCallable,
  describePipe,
  next,
  pipeline,
  port,
  portK,
  projectWiringGraph,
  symbol,
} from '@s-age/kernelee';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The dispatch entry point — its id doubles as the catalog key below, which is what makes
// `projectWiringGraph` classify `demo.checkout` as `kind: 'endpoint'` (bound) rather than
// `divertTarget` (only reachable via a divert, like `demo.restock` further down).
const checkoutCmd = symbol('demo.checkout', 'Run checkout');
const receiveOrder = symbol('demo.receiveOrder', 'Receive an order');
const priceOrder = symbol('demo.priceOrder', 'Calculate the price');

// A defineCallable-declared port, so the sample also exercises defineCallable
// wiring, not just plain pipe()/fork().
const NotifyPort = defineCallable('Demo.Notify', {
  email: port('Send an email notification'),
  sms: portK('Send an SMS notification (kernel-composing)'),
});

// Named part handlers — the names match sample-index.json's `handler` entries, so the
// bundled sample exercises the part-color join (switch/emitter/mutator washes) and the
// named-operand node label (`effect(recordSmsSent)`) the same way a real catalog does.
// `handlerNameOf` reads `fn.name`, hence hoisted declarations, not inline arrows.
function outOfStockSwitch(_kernel, value) {
  return next(value);
}
function joinNotifyResults(results) {
  return results;
}
async function recordSmsSent() {
  /* named logging stage — still anonymous-shaped for the `collapsed` toggle (map/effect compact) */
}

const checkoutPipe = pipeline(receiveOrder)
  .pipe(priceOrder)
  .pipe(
    { note: 'Divert to restock-wait when out of stock', divertsTo: ['demo.restock', 'demo.legacyCheckout'] },
    outOfStockSwitch,
  )
  .fork(pipeline(NotifyPort.email), pipeline(NotifyPort.sms).effect(recordSmsSent))
  .map(joinNotifyResults)
  .seal();

const restockPipe = pipeline(priceOrder).seal();

const checkoutEntry = describePipe(
  checkoutCmd.id,
  'Checkout',
  checkoutPipe,
  'Sample: pipe(symbol) → pipe(function)(divert) → fork(branches)(defineCallable branches)',
);
const restockEntry = describePipe('demo.restock', 'Restock wait', restockPipe, 'Sample divertTarget');

const builder = new KernelBuilder();
// Placeholder handler: this generator only needs `checkoutCmd.id` bound so it classifies as
// `endpoint`, not that dispatching it actually runs `checkoutPipe` end to end.
builder.register(checkoutCmd, (v) => v);
builder.register(receiveOrder, (v) => v);
builder.register(priceOrder, (v) => v);
NotifyPort.wire(
  {
    email: async () => undefined,
    sms: async (_kernel) => undefined,
  },
  builder,
);

const doc = projectWiringGraph([checkoutEntry, restockEntry], builder.boundSymbolIds);

const outPath = join(__dirname, '..', 'public', 'sample-catalog.json');
await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${outPath}`);
