# kernelee-devtools-bridge

A development-only WS bridge for viewing a
[`kernelee`](https://github.com/s-age/kernelee) app's wiring graph (static snapshot) and
trace timeline (span parent/child relationships, live Buffer state) in a browser panel.

- **Kernel-side connector** (`@s-age/kernelee-devtools-bridge/connector`) — attaches to the app's
  `Kernel` at zero cost and forwards `onTrace`/the catalog over WS.
- **Server** (`@s-age/kernelee-devtools-bridge`, or the `kernelee-devtools-bridge` command) — a single
  process that both relays WS messages and statically serves the panel UI (wiring tab + trace
  tab).

Never include it in production builds (start it dev-server-style during development only).

## Requirements

`@s-age/kernelee` >= 0.4.0 (the first release whose `WiringGraphDocument.schemaVersion` is 6 —
the version this bridge's WS server requires to accept and cache a `catalog` message; see
`docs/bridge-drops-nonconforming-messages.md`). The server drops (never caches, persists, or
relays) any WS message that fails this envelope check, logging why via `console.warn` — it is a
validator of the wire contract, not a rescuer of malformed or out-of-range messages.

## How it differs from Redux DevTools

Redux DevTools is implemented as a Chrome(-based browser) extension, so it only works in
browsers/environments where that extension is available. `kernelee-devtools-bridge` is **not an
extension — just a WS server + a static HTML page**, so:

- It is browser-agnostic (it doesn't depend on any extension mechanism, so it works as-is in
  browsers without extension support, and in future browsers).
- Even when the kernel runs on the Node side (server-side / CLI apps), you see it in the same
  panel — a case that is fundamentally impossible for an extension tied to the browser's DOM/JS
  execution.
- Installation is `npm install` + one line in `package.json`
  (`"devtools": "kernelee-devtools-bridge"`), with no need to reinstall an extension per browser
  (see Quick start below).

## Quick start

1. Add it to the app as a devDependency:

   ```sh
   npm install --save-dev @s-age/kernelee-devtools-bridge
   ```

2. Add one line to the app's `package.json` `scripts` (it just invokes the `bin` entry — no new
   code needed):

   ```json
   {
     "scripts": {
       "devtools": "kernelee-devtools-bridge"
     }
   }
   ```

3. During development, run two things in separate terminals:

   ```sh
   npm run devtools   # the panel comes up at http://localhost:7331 (default port)
   npm run dev        # the app's own dev server
   ```

   To pass a flag through to the bridge, use npm's `--` separator — **without it, npm
   swallows the flag itself instead of forwarding it to the script**. So `npm run devtools
   -- --port 8080` to change the port, or `npm run devtools -- --trace-cap 500` to retain
   more trace entries (default 300; see the [CLI](#cli) section for the memory tradeoff).

4. In the app's entry point (development only — guard with `import.meta.env.DEV`, for example),
   connect the kernel to the connector:

   ```ts
   import { connectDevtoolsBridge } from '@s-age/kernelee-devtools-bridge/connector';
   import { describePipe, projectWiringGraph } from '@s-age/kernelee';

   if (import.meta.env.DEV) {
     const bridge = connectDevtoolsBridge();
     const kernel = builder.build({ tracing: true, onTrace: bridge.onTrace });
     bridge.sendCatalog(
       projectWiringGraph([describePipe('my.pipe', 'description', myPipe)], builder.boundSymbolIds),
     );
   }
   ```

   Open `http://localhost:7331/` in a browser to see the actual wiring and a live trace.

## Import from the `connector` subpath

```ts
import { connectDevtoolsBridge } from '@s-age/kernelee-devtools-bridge/connector'; // ✅
import { connectDevtoolsBridge } from '@s-age/kernelee-devtools-bridge';           // ❌ avoid in browser bundles
```

The barrel (`@s-age/kernelee-devtools-bridge`, `.`) also re-exports `startBridgeServer`, whose
implementation (`server.ts`) depends on `node:http`/`node:fs`/`node:path`/`ws`. Importing via
the barrel makes bundlers like Vite pull these Node-only modules into the static graph, and the
browser-targeted build fails to resolve them. `connector.ts` itself has zero Node dependencies
(it uses only the global `WebSocket`), so kernel apps that run in a browser should always use
the `./connector` subpath.

For Node-only apps (servers/CLIs that skip a bundler), you can also call `startBridgeServer`
directly from the barrel to start the server **inside your own process** — instead of launching
a separate process with `npm run devtools`, one call at app startup suffices:

```ts
import { startBridgeServer, connectDevtoolsBridge } from '@s-age/kernelee-devtools-bridge';

await startBridgeServer({ port: 7331 });     // start the server in this process
const bridge = connectDevtoolsBridge();      // connect to that server
```

## `connectDevtoolsBridge` is safe even when pointed at a server that isn't running

If you start the app before the server is up, `onError` (default: `console.error`) is called
once on the first connection failure, after which it quietly keeps retrying to reconnect
indefinitely with a 250ms→8s-capped backoff. This is designed so that "server not started yet"
can be ignored in the normal development flow.

## How catalog and trace relate

- `catalog` (`WiringGraphDocument` — built with `describePipe`/`projectWiringGraph`, part of
  `kernelee`'s own API) only needs to be sent once, right after startup — the connector keeps it as
  its `latestCatalog` and re-sends the same text on every (re)connect, so a bridge server restart
  (or any other reconnect) never leaves a newly-opened panel without a graph. The server also caches
  just the last one received and replays it to panels that connect later (browser tabs opened late).
  An unchanged catalog arrives as the exact same bytes on every path (resend, replay, relay) — see
  `src/protocol.ts`'s byte-identity contract; the panel relies on this to dedupe same-content
  resends and keep selection state instead of resetting it.
- `trace` (via `onTrace`, per invocation) is neither cached nor replayed — a panel that connects
  late cannot see earlier traces (live streaming only).

## Options

`connectDevtoolsBridge(options)`:

| Option | Default | Description |
|---|---|---|
| `url` | `ws://localhost:7331/ws` | Where to connect |
| `onError` | `console.error` | Called on every connection failure / socket error |
| `pendingCap` | `300` | Cap on the queue of unsent `trace` messages (`catalog` is exempt — the connector always keeps just the latest one and re-sends it on every reconnect) |
| `buffer` / `watchBuffers` | — | Embed snapshots of `Buffer` cells into trace entries. Watched keys are validated at construction — an entry whose state is not allocated on `buffer` makes `connectDevtoolsBridge` throw immediately (the Buffer's cell set is frozen at `build()`, so a key unreadable at construction can never become readable later). |

`startBridgeServer(options)`:

| Option | Default | Description |
|---|---|---|
| `port` | `7331` | Port to listen on (`0` for an OS-assigned free port) |
| `publicDir` | The package's bundled `public/` | Where the panel UI (HTML/JS/vendored relaph) is served from |

## Panel UI

`Wiring` tab: rendered as a node graph with
[relaph](https://www.npmjs.com/package/relaph). Sidebar search, click a stage to open the
inspector, divertsTo jumps, mainLineOnly/collapsed toggles, zoom/Fit.

`Trace` tab: shows span parent/child relationships as a tree (call-backs from handler bodies
nest correctly). Click an entry to see the Buffer snapshot at that moment. A 300-entry ring
buffer caps retention on both the client and the server side.

## CLI

```sh
kernelee-devtools-bridge [--port 7331] [--trace-cap 300] [--trace-out <path>] [--repo-root <path>]
```

`npm run devtools` invokes this CLI as-is. For apps that don't use a bundler / run remotely and
just need to be attached to after the fact, invoking the CLI directly works the same way.

`--trace-cap N` sets how many of the most-recent trace entries are retained — one knob bounding
**both** the persisted trace file (what `arch_monitor` reads) and the panel's timeline, kept in
sync (the panel follows this value, injected into `/panel-config.json`). Raising it costs only
**linear memory, never extra per-call CPU**: each entry is bounded to ~1KB (payloads are truncated
and binary buffers summarized up front), so a larger cap adds ~N×1KB of retained memory and no hot-
path cost. Default 300; lower it (e.g. `--trace-cap 5`) for a near-zero footprint. It does **not**
touch the app's own in-process kernel ring (`KernelBuildOptions.traceCap`) or the connector's
offline send-backlog cap (`pendingCap`) — those are deliberately independent knobs.

`--trace-out <path>` overrides where the persisted trace file lands. When omitted, it defaults to
`<repoRoot>/node_modules/.cache/kernelee-devtools-bridge/trace.json`, where `repoRoot` is
`--repo-root` if given, else `cwd`. This default is **repo-local and per-project on purpose**: it
used to be a single fixed `/tmp/kernelee-trace.json` shared by every bridge on the machine, which
meant two projects' CLIs running at once (the common case for anyone with two kernelee repos open)
clobbered each other's entire trace ring on every flush, a sticky-bit `/tmp` turned cross-user
`rename` into a silently-swallowed EPERM, and a predictable shared tmp name was a symlink-follow
hazard. `node_modules/.cache` is gitignored and watcher-excluded everywhere already, and its
lifecycle matches the data's own (born with a checkout, gone with `rm -rf node_modules`).

This default is deliberately reused by kernelee-lifegame's `arch_monitor` launcher, which imports
the same derivation rule from this package's `"./trace-path"` subpath export
(`defaultTraceOutPath(repoRoot)`) rather than hardcoding the path a second time. The one thing that
import does **not** unify is `repoRoot` itself — the CLI derives it from `--repo-root ?? cwd`,
while the launcher derives it from its own script's location — so the two only land on the same
path when the CLI is run from the consumer repo's root (`npm run devtools`, the normal case). If
you invoke the CLI directly from a different `cwd`, pass `--repo-root <repo>` to match; otherwise
the CLI writes into the wrong repo's cache and `arch_monitor` reads a stale-or-missing file (a
visible failure — file absence — rather than a silent takeover by another project's session).

Any leftover `/tmp/kernelee-trace.json` from a previous version of this package is inert rolling
data and safe to delete manually.

## License

[MIT](LICENSE) © s-age
