# IJC SMARTFLOW

## Run the app

1. Install dependencies with `npm ci`.
2. Configure `GEMINI_API_KEY` in `.env` (see `.env.example`).
3. Run `npm run dev` to build and serve the app with its Express API on port 3000.

The default preview serves compiled assets without the Vite development client or
its WebSocket connection. After changing source, restart `npm run dev` to rebuild.
Use `npm run build` followed by `npm start` for deployment. `npm run preview`
also serves the existing build with the API, so OCR remains available.

For local development with hot updates, run `npm run dev:watch`. Vite shares the
Express HTTP server for WebSocket upgrades. A proxy used with this development
mode must support WebSocket forwarding; otherwise use the default preview.

## Checks

```sh
npm run build
npx tsc --noEmit
npx tsx --test tests/*.test.ts
```
