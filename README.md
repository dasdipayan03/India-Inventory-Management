# India Inventory Management Pro

Separate professional refactor copy of the current project.

Original repo left unchanged:

```text
C:\Users\Dipayan\OneDrive\Desktop\PROJECT_ALL_DOCUMENTS\India-Inventory-Management-Dev
```

New copy:

```text
C:\Users\Dipayan\OneDrive\Desktop\India-Inventory-Management-Pro
```

## What Changed

- Backend source moved under `src/`.
- Root `server.js` and `db.js` kept as compatibility entry files.
- Database config lives in `src/config/database.js`.
- Routes, middleware, repositories, and utilities live under `src/`.
- Responsive premium UI override added at `public/css/responsive-pro.css`.
- Dashboard, invoice, and login pages now load the responsive UI layer.
- `.env.example` added for deployment/local setup reference.

## Commands

Use `npm.cmd` in PowerShell if `npm` is blocked by script policy.

```powershell
npm.cmd install
npm.cmd run check
npm.cmd start
```

Before starting, configure environment variables such as `DATABASE_URL` and
`JWT_SECRET`.
