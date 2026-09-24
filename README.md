# Mermaid diagrams

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that renders ` ```mermaid ` code blocks as diagrams wherever the board renders markdown: the `.md` file preview, the task-memory preview and the chat view.

Hover a diagram for GitHub-style zoom and pan controls, or drag it to pan. Diagrams follow the board's light or dark theme. A block mermaid can't parse stays as code with a red edge; hover it for the error. Turning the extension off puts the original code blocks back.

Browser-only: no tools, no capabilities, no dependencies. Mermaid itself (about 5.5 MB) is fetched the first time a diagram appears on screen.

## Install

In the wrangler's Extensions tab, install from this repository's git URL. It asks for no capabilities.

## How it works

The wrangler has no slot for markdown rendering, so `public/client.js` watches the three containers the core renderer writes into (`#file-body`, `#memory-preview`, `#chat-stream`) and swaps each `<pre><code class="language-mermaid">` for an SVG. If a future wrangler renames one of those containers, that view stops getting diagrams and nothing else breaks.

## Develop

To try it on a dev wrangler, **copy** (don't symlink) this directory to `<AW_DATA_DIR>/extensions/mermaid` and start the wrangler.

Mermaid is vendored in `public/vendor/`, not an npm dependency: the wrangler serves only `public/`, and a dependency's whole tree would be listed in the install consent modal. To update it:

```
npm run vendor          # latest
npm run vendor -- 12.0.0
```

## Licence

Apache-2.0, see `LICENSE`. Mermaid is MIT, see `public/vendor/mermaid.LICENSE`.
