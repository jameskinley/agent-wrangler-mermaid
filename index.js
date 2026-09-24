import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The loader resolves `client` and `styles` inside this directory's public/
// subdir, so the manifest has to say where it lives.
export const dir = path.dirname(fileURLToPath(import.meta.url));

// Browser-only: no tools, handlers, stores or capabilities. Everything happens
// in public/client.js.
export default {
  id: 'mermaid',
  label: 'Mermaid diagrams',
  help: 'Renders ```mermaid code blocks as diagrams in the markdown file preview, the task-memory preview and the chat view.',
  defaultEnabled: true,
  engines: { wranglerApi: '^1.0.0' },
  client: 'public/client.js',
  styles: 'public/mermaid.css',
};
