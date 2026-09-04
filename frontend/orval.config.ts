// orval's own configuration. The frontend generates the whole wire contract from the one boundary
// schema — its types and the fetch client that calls each route — so no route is hand-authored here
// and the drift gate sees routes rather than types alone (ADR 0008 rev 5).
//
// `client: 'fetch'` emits a bare `fetch()` call against a relative URL: no runtime package enters
// the browser module graph, and every declaration lands in the emitted file rather than in
// node_modules. `prettier` is orval's own peer, run over its output because it otherwise emits
// stray semicolons and blank-line runs.
//
// Paths are relative to this file, which sits at the frontend package root.
import { defineConfig } from 'orval';

export default defineConfig({
  boundary: {
    input: '../boundary/openapi.yaml',
    output: {
      target: 'src/lib/boundary/client.ts',
      mode: 'single',
      client: 'fetch',
      formatter: 'prettier',
    },
  },
});
