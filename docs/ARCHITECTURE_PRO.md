# India Inventory Management Pro Architecture

This folder is a separate professional refactor copy of the original project.
The original `India-Inventory-Management-Dev` repository was not edited.

## Goals

- Keep the current business functionality and API behavior intact.
- Move runtime code toward a cleaner `src/` architecture.
- Add a reusable responsive visual layer for mobile, tablet, and laptop screens.
- Keep deployment compatible with `npm start`.

## Structure

```text
src/
  server.js        Express bootstrap and runtime lifecycle
  config/
    database.js    PostgreSQL pool, startup checks, schema compatibility
  routes/          API route modules
  middleware/      Auth, cache, export queue middleware
  repositories/    Data access helpers
  utils/           Runtime logs, monitoring, cache, pagination, queues
public/
  css/
    responsive-pro.css
  js/
    app-core.js
    app-shell.js
    dashboard.js
migrations/
docs/
```

## Refactor Rules

- Existing HTML element IDs are preserved so current JavaScript keeps working.
- Existing API routes are preserved under the same `/api` paths.
- Root `server.js` remains as a compatibility bootstrap for Railway and local start.
- Root `db.js` remains as a compatibility export for older imports.
- Professional UI changes are layered through `public/css/responsive-pro.css`.
