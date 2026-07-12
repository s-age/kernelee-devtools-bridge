# Open-in-editor is protocol links only

Context: inspector source links (declaration/implementation/handler/wire/drivenBy) open the
consumer's editor at file:line; the rejected alternative was a POST /open-in-editor endpoint
spawning the editor server-side (launch-editor package, as Vite/Vue devtools do).

## What

**Editor opening is protocol URLs only — the server never spawns anything.**
Built-in editors are exactly the five whose app bundle registers its own URL
scheme (vscode / vscode-insiders / cursor / windsurf / zed, all sharing
`{scheme}://file{path}:{line}:{column}`). Anything conditional (JetBrains:
macOS-only without Toolbox; TextMate/Nova: niche) is the consumer's call via
`/panel-config.json`'s `editors: [{id, label, urlTemplate}]` — same id
replaces a builtin, new id appends; placeholders are `{path}`/`{line}`/
`{column}`. The toolbar select persists to localStorage, which beats the
config's `defaultEditor` (repo recommendation < personal pick).

`repoRoot` is merged into the `/panel-config.json` RESPONSE by the server
(`--repo-root`, default cwd) and overwritten if present in the file itself.

## Why

- A localhost open endpoint is reachable by any web page via fetch (Vite had
  CVEs of exactly this shape); protocol links move the trust decision to the
  browser/OS ("Open Visual Studio Code?") and delete the attack surface
  instead of guarding it (POST-only + Origin checks we'd otherwise owe).
- The builtin criterion "app registers the scheme itself" keeps every listed
  editor zero-install-guaranteed; everything needing a companion (Toolbox,
  a plugin) degrades to an explicit consumer opt-in rather than a silently
  broken default.
- The committed panel config is checked into the consumer repo, so a
  machine-specific absolute repoRoot there would break every other checkout —
  the server knows it at runtime (facts declared where they are born).

The cost accepted: no feedback when the scheme is unregistered (the browser
shrugs), and links only work when browser and repo share a machine.
