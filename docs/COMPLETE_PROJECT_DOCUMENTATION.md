# India Inventory Management Complete Project Documentation

## 1. Why this document exists

This document is a full easy-language guide for the current project.

The goal is:

- help you understand the full project later without re-reading the whole codebase
- help any new developer quickly understand how the app works
- explain what each folder and file does
- explain the important code blocks inside each main file
- explain the feature flow from login to reports

This document is based on the current project snapshot in this repository.

## 2. Project summary in simple language

This project is a business web app for shop owners.

It helps with:

- stock entry
- sale and invoice generation
- stock report
- sales report
- GST report
- customer due tracking
- staff account access control
- password reset and login system

The app has:

- a Node.js + Express backend
- a PostgreSQL database
- static HTML pages
- vanilla JavaScript frontend logic
- one shared sidebar system

The main idea is:

- the `admin` account is the real business owner
- `staff` accounts work under that owner
- staff data is not separate business data
- stock, invoices, reports, dues all belong to the owner account

## 3. Technology stack

### Backend

- Node.js
- Express
- PostgreSQL using `pg`
- JWT for session tokens
- `bcrypt` for password hashing
- `helmet`, `cors`, `compression`, `cookie-parser`, `express-rate-limit`
- `pdfkit` for PDF export
- `exceljs` for Excel export

### Frontend

- Static HTML pages
- Custom CSS inside page files
- Vanilla JavaScript
- Shared frontend config in `public/js`
- `Chart.js` via `chart.min.js`
- Font Awesome icons
- Fontsource Manrope font

## 4. High-level system architecture

```text
Browser
  -> login.html / index.html / invoice.html / reset.html
  -> frontend JS
  -> /api/... requests

Express server
  -> server.js
  -> middleware/auth.js
  -> routes/auth.js
  -> routes/inventory.js
  -> routes/invoices.js

Database
  -> users
  -> staff_accounts
  -> settings
  -> items
  -> sales
  -> invoices
  -> invoice_items
  -> debts
  -> user_invoice_counter
```

## 5. Main business features

### 5.1 Account system

- Admin registration
- Admin login using email or mobile number
- Staff login using username
- Forgot password by email only
- Reset password through reset link

### 5.2 Inventory

- Add new stock
- Update existing stock
- Auto-suggest item names
- Check previous buying rate
- Auto calculate selling rate using profit percent
- Save default profit percent in database settings

### 5.3 Stock reporting

- Item-wise stock report
- Available quantity
- Buying rate and selling rate
- Sold quantity
- Low stock alerts
- Reorder suggestion planner
- PDF export

### 5.4 Sales reporting

- Date range sales report
- Sales table preview
- PDF export
- Excel export
- Monthly trend chart
- Last 13 months sales chart

### 5.5 GST reporting

- Invoice-wise GST report
- Date filter
- Effective GST summary
- Monthly GST summary
- GST rate summary
- PDF export
- Excel export

### 5.6 Invoice system

- Generate next invoice number
- Create invoice with customer details
- Add multiple line items
- GST calculation
- Draft save in browser
- Invoice history search
- Invoice detail preview
- Invoice PDF download
- Shop info for invoice header
- Negative quantity return flow support

### 5.7 Customer due management

- Create due entry
- Search customer by number/name
- Full ledger by customer number
- All due summary

### 5.8 Staff access control

- Create up to 2 staff accounts
- Assign page permissions
- Update permissions later
- Delete staff accounts
- Staff only sees allowed pages

## 6. Main user workflows

## 6.1 Admin register flow

```text
User opens login.html
  -> opens register form
  -> enters shop name, email, mobile number, password
  -> POST /api/auth/register
  -> user row created in database
  -> user goes back to login
```

## 6.2 Admin login flow

```text
User opens login.html
  -> enters email or mobile number + password
  -> POST /api/auth/login
  -> JWT token returned
  -> token saved in localStorage + cookie session is set
  -> redirect to index.html
```

## 6.3 Staff login flow

```text
Staff opens login.html
  -> enters username + password
  -> POST /api/auth/staff/login
  -> JWT token returned
  -> redirect to index.html
  -> only assigned pages become visible
```

## 6.4 Forgot/reset password flow

```text
User opens forgot password form
  -> enters registered email
  -> POST /api/auth/forgot-password
  -> backend creates reset token
  -> reset link sent by mail relay

User opens reset link
  -> reset.html loads email + token from URL
  -> user enters new password
  -> POST /api/auth/reset-password
  -> password updated
  -> redirect to login.html
```

## 6.5 Add stock flow

```text
User opens Add New Stock
  -> enters item name, quantity, buying rate
  -> selling rate auto updates from profit percent
  -> POST /api/items
  -> if item exists: quantity increases
  -> if item is new: new item row is created
```

## 6.6 Invoice flow

```text
User opens invoice.html
  -> app loads next invoice number
  -> app loads shop info
  -> user adds customer details
  -> user adds item rows
  -> app auto calculates subtotal, GST, total
  -> user submits invoice
  -> backend creates invoice + invoice_items + sales rows
  -> stock quantity is reduced
  -> optional PDF download prompt appears
```

## 6.7 Negative quantity return flow

```text
Invoice item quantity is negative
  -> backend still accepts non-zero quantity
  -> sales row stores negative quantity and amount
  -> item stock is added back
  -> effect becomes a return/reverse sale
```

## 6.8 Report export flow

```text
User chooses report and date range
  -> frontend calls JSON preview endpoint
  -> user sees report table
  -> user clicks PDF or Excel
  -> backend streams file response
```

## 6.9 Staff permission flow

```text
Admin opens Staff Access
  -> GET /api/auth/staff
  -> admin creates staff with page permissions
  -> later PATCH permission changes can be applied
  -> middleware/auth.js rechecks live staff permissions on each request
```

## 7. Folder structure and what each folder does

## 7.1 Top-level folders

### `.vscode/`

Editor-level settings for this project.

### `docs/`

Project documentation files.

### `middleware/`

Express middleware files. Right now mainly auth and permission guard logic.

### `migrations/`

Database schema files and migration SQL.

### `public/`

Frontend pages, frontend JS, and static assets.

### `routes/`

API route files grouped by business area.

### `utils/`

Small reusable helper utilities used by backend code.

### `node_modules/`

Installed packages. External code. You normally do not edit this folder.

## 7.2 Top-level files

### `.gitignore`

Ignores:

- `node_modules/`
- `.env`

### `package.json`

Defines project name, dependencies, and the `start` command.

### `package-lock.json`

Locked dependency versions. Keep this for stable installs.

### `server.js`

Main server startup file.

### `db.js`

Creates PostgreSQL pool and performs startup DB checks.

## 8. Complete file-by-file guide

This section explains every tracked project file in this repository and what it does.

## 8.1 `.vscode/settings.json`

Purpose:

- local editor setting only

Current behavior:

- opens ChatGPT integration on startup

This file does not affect app runtime.

## 8.2 `package.json`

Purpose:

- declares app metadata
- declares all runtime dependencies
- defines how server starts

Important block:

- `scripts.start`
  - starts `server.js`

## 8.3 `package-lock.json`

Purpose:

- keeps exact dependency versions stable

You do not usually read it manually.

## 8.4 `db.js`

Purpose:

- connect to PostgreSQL
- decide SSL mode
- fail early if DB config is missing
- ensure latest required settings column exists

Main code blocks inside this file:

### Block 1: `shouldUseSsl(...)`

What it does:

- decides whether DB SSL should be enabled
- uses `DB_SSL` if explicitly set
- otherwise enables SSL outside localhost

### Block 2: environment validation

What it does:

- stops app startup if `DATABASE_URL` is missing

### Block 3: `new Pool(...)`

What it does:

- creates the PostgreSQL connection pool

### Block 4: pool error listener

What it does:

- logs unexpected DB pool errors

### Block 5: startup query

What it does:

- checks DB connection with `SELECT 1`
- ensures `settings.default_profit_percent` column exists

## 8.5 `server.js`

Purpose:

- main application bootstrap
- configures middleware
- registers routes
- serves frontend pages
- starts server
- handles graceful shutdown

Main code blocks inside this file:

### Block 1: imports

Loads Express, path, security middleware, cookie parser, compression, and DB pool.

### Block 2: app creation

Creates Express app and enables proxy trust for deployment platforms.

### Block 3: `buildAllowedOrigins()`

What it does:

- builds allowed CORS origins
- uses env config in production
- allows localhost ports in development

### Block 4: global middleware

What it does:

- enables CORS
- parses JSON
- parses cookies
- compresses responses
- rate limits requests

### Block 5: Helmet CSP

What it does:

- restricts scripts, styles, fonts, and images
- allows required CDNs for icons and fonts

### Block 6: API route registration

Mounted routes:

- `/api/auth`
- `/api` inventory routes
- `/api` invoice routes

### Block 7: health route

What it does:

- `/health` returns `OK`
- useful for Railway or uptime checks

### Block 8: debug routes

Only active outside production.

Routes:

- `/debug-env`
- `/debug-db`

### Block 9: static file serving

What it does:

- serves everything from `public/`

### Block 10: root route and fallback

What it does:

- `/` opens `login.html`
- unknown non-API routes also return `login.html`
- unknown API routes return JSON 404

### Block 11: global error handler

What it does:

- catches unhandled errors
- gives safer production output

### Block 12: server startup and shutdown

What it does:

- starts on `PORT` or `8080`
- handles `SIGTERM`
- closes HTTP server and DB pool cleanly

## 8.6 `middleware/auth.js`

Purpose:

- verify JWT
- attach live session info to `req.user`
- re-read staff permissions from DB
- provide permission guard helpers

Main code blocks inside this file:

### Block 1: JWT secret validation

Stops startup if `JWT_SECRET` is missing.

### Block 2: `authMiddleware`

What it does:

- reads token from `Authorization` header or cookie
- verifies JWT
- if staff:
  - reloads current staff row from DB
  - checks active status
  - refreshes permissions
- if admin:
  - grants full access

This is important because staff permissions are not trusted only from old token data.

### Block 3: helper getters

Functions:

- `getUserId(req)`
- `getActorId(req)`

Purpose:

- safely extract owner ID and current actor ID

### Block 4: role and permission helpers

Functions:

- `isAdminSession`
- `hasPermission`
- `requireAdmin`
- `requirePermission`
- `allowRoles`

Purpose:

- protect routes correctly

## 8.7 `utils/concurrency.js`

Purpose:

- normalize text for consistent lookup
- create scoped PostgreSQL advisory locks

Main code blocks inside this file:

### Block 1: text normalizers

- `normalizeLookupText`
- `normalizeDisplayText`

Use case:

- avoid duplicate item/customer matching caused by spacing or casing differences

### Block 2: `hashTextToInt`

What it does:

- converts text into an integer lock key

### Block 3: `lockScopedResource`

What it does:

- creates transaction-level advisory locks
- prevents race conditions while updating stock or debt records

## 8.8 `migrations/full_updated_schema.sql`

Purpose:

- full snapshot of current database schema
- useful for fresh DB setup

Main tables created here:

- `users`
- `staff_accounts`
- `items`
- `sales`
- `debts`
- `settings`
- `invoices`
- `invoice_items`
- `user_invoice_counter`

Also includes:

- indexes
- timestamp trigger function
- update triggers

## 8.9 `migrations/20260319_default_profit_percent.sql`

Purpose:

- adds `default_profit_percent` to `settings`

Use case:

- saves default profit % from Add Stock form

## 8.10 `routes/auth.js`

Purpose:

- all authentication and staff-account APIs

Main code blocks inside this file:

### Block 1: shared helpers and normalizers

Important helpers:

- `normalizeName`
- `normalizeEmail`
- `normalizeMobileNumber`
- `normalizeUsername`
- `isValidMobileNumber`

Purpose:

- clean all user input before DB or login checks

### Block 2: session helpers

Functions:

- `signSession`
- `setSessionCookie`
- `clearSessionCookie`
- `buildAdminSession`
- `buildStaffSession`
- `toClientUser`

Purpose:

- build consistent session payload for frontend and cookies

### Block 3: user lookup helpers

Functions:

- `getAdminsByIdentifier`
- `getStaffByUsername`

Purpose:

- admin can log in by email or mobile number
- staff logs in by username

### Block 4: `POST /register`

What it does:

- creates admin account
- requires name, email, mobile number, password
- blocks duplicate email and duplicate mobile number
- hashes password with bcrypt

### Block 5: `POST /login`

What it does:

- admin login
- accepts email or mobile number
- supports duplicate-mobile safety by forcing email if mobile conflicts

### Block 6: `POST /staff/login`

What it does:

- logs staff in by username and password

### Block 7: `POST /logout`

What it does:

- clears auth cookie

### Block 8: `POST /forgot-password`

What it does:

- email-only reset flow
- creates reset token
- stores expiry
- sends email through mail relay if configured

### Block 9: `POST /reset-password`

What it does:

- validates email + token + new password
- checks expiry
- updates password hash
- clears reset token fields

### Block 10: staff management routes

Routes:

- `GET /staff`
- `POST /staff`
- `PATCH /staff/:staffId/permissions`
- `DELETE /staff/:staffId`

Purpose:

- create and manage staff accounts
- enforce max 2 staff accounts per admin
- assign page permissions

### Block 11: `GET /me`

What it does:

- returns current session info
- refreshes staff session data from DB

## 8.11 `routes/inventory.js`

Purpose:

- all non-invoice business APIs:
  - stock
  - stock defaults
  - low stock
  - reorder planner
  - sales report
  - GST report
  - debts
  - dashboard overview
  - charts

Main code blocks inside this file:

### Block 1: constants and format helpers

Includes:

- stock alert config
- PDF theme
- currency/date format helpers
- file name sanitizer
- non-negative number parser

Purpose:

- keeps report formatting and validation reusable

### Block 2: `getShopName(...)`

What it does:

- reads shop name from `settings`
- used in report exports

### Block 3: PDF layout helpers

Functions:

- `drawPdfBanner`
- `drawPdfTableHeader`
- `ensurePdfSpace`

Purpose:

- keep PDF exports visually consistent

### Block 4: stock health helpers

Functions:

- `getLowStockStatus`
- `getReorderPriority`

Purpose:

- label stock urgency by days left

### Block 5: route-level auth protection

`router.use(authMiddleware)`

Meaning:

- every inventory route needs authenticated user

### Block 6: stock default settings

Routes:

- `GET /stock-defaults`
- `PUT /stock-defaults`

Purpose:

- read/save default profit percent for Add Stock form

### Block 7: stock item add/update

Route:

- `POST /items`

Purpose:

- create item if new
- increase quantity if item already exists
- update rates
- uses advisory lock for safe concurrent updates

### Block 8: item lookup routes

Routes:

- `GET /items/names`
- `GET /items/info`

Purpose:

- autocomplete item names
- fetch current stock/rates for one item

### Block 9: stock report routes

Routes:

- `GET /items/report`
- `GET /items/report/pdf`

Purpose:

- item-wise stock and sold quantity report
- PDF export version

### Block 10: low stock and reorder planner

Routes:

- `GET /items/low-stock`
- `GET /items/reorder-suggestions`

Purpose:

- estimate days left from last 30 days sales
- suggest reorder quantity and cost

### Block 11: sales report routes

Routes:

- `GET /sales/report`
- `GET /sales/report/pdf`
- `GET /sales/report/excel`

Purpose:

- date-range sales data preview and export

### Block 12: GST report helpers

Functions:

- `fetchGstReportRows`
- `summarizeGstRows`

Purpose:

- build invoice-based GST reporting data

### Block 13: GST report routes

Routes:

- `GET /gst/report`
- `GET /gst/report/pdf`
- `GET /gst/report/excel`

Purpose:

- preview and export GST data

### Block 14: customer due routes

Routes:

- `POST /debts`
- `GET /debts/customers`
- `GET /debts/:number`
- `GET /debts`

Purpose:

- save due entries
- customer autosuggest
- full ledger
- due summary

### Block 15: dashboard overview

Route:

- `GET /dashboard/overview`

Purpose:

- loads top dashboard metrics for admin

### Block 16: charts

Routes:

- `GET /sales/monthly-trend`
- `GET /sales/last-13-months`

Purpose:

- chart data for dashboard analytics

### Block 17: route error handler

What it does:

- catches unhandled route errors inside this router

## 8.12 `routes/invoices.js`

Purpose:

- all invoice creation, invoice history, invoice PDF, and shop profile APIs

Main code blocks inside this file:

### Block 1: helpers for invoice numbers and number parsing

Functions:

- `padSerial`
- `parsePositiveNumber`
- `parseNonZeroNumber`
- retryable error helpers

Purpose:

- format invoice serials
- validate line item data
- detect retry-safe DB errors

### Block 2: `generateInvoiceNoWithClient(...)`

What it does:

- generates daily invoice number using:
  - current date
  - user id
  - serial from `user_invoice_counter`

Format:

- `INV-YYYYMMDD-userId-serial`

### Block 3: `GET /invoices/new`

What it does:

- previews next invoice number without saving invoice

### Block 4: `POST /invoices`

This is one of the most important code blocks in the project.

What it does:

- validates line items
- calculates subtotal, GST, total
- locks matching stock rows
- checks stock availability
- creates invoice row
- creates invoice item rows
- creates `sales` rows
- reduces stock
- supports negative quantity return flow
- retries for invoice number conflicts

This route is the core billing transaction of the app.

### Block 5: invoice search helpers

Routes:

- `GET /invoices/numbers`
- `GET /invoices`

Purpose:

- recent invoice number dropdown
- invoice history search by invoice/customer/contact/date text

### Block 6: invoice detail

Route:

- `GET /invoices/:invoiceNo`

Purpose:

- return invoice with all line items

### Block 7: invoice PDF route

Route:

- `GET /invoices/:invoiceNo/pdf`

Purpose:

- generate printable invoice PDF
- supports token in query string for direct download

### Block 8: shop profile routes

Routes:

- `POST /shop-info`
- `GET /shop-info`

Purpose:

- save/load shop name, address, GST number, GST rate
- used by invoice builder and invoice PDF

## 8.13 `public/js/permission-contract.js`

Purpose:

- one shared permission contract between frontend and backend

Main code blocks:

### Block 1: `STAFF_PAGE_CONFIG`

Defines:

- permission key
- label
- short label
- matching section ID

### Block 2: permission arrays

Defines:

- all valid staff permissions
- default staff permissions

### Block 3: `normalizePermissions(...)`

Purpose:

- remove invalid values
- lowercase permission names
- remove duplicates

## 8.14 `public/js/app-core.js`

Purpose:

- central frontend configuration file

Main code blocks inside this file:

### Block 1: app config bootstrap

Creates global `window.InventoryApp`.

### Block 2: API base resolution

What it does:

- uses localhost API during local development
- uses `/api` in deployed environment

### Block 3: copyright and permission descriptions

Shared text config for the app shell.

### Block 4: sidebar item definitions

This is the master sidebar config.

It defines:

- page/section kind
- permission key
- icon
- label
- eyebrow
- description
- badge

### Block 5: permission helper functions

Functions:

- `normalizePermissions`
- `getPermissionOption`
- `formatPermissionSummary`
- `getUserPermissions`
- `canAccessPermission`
- `canAccessSection`
- `isAdminUser`

Purpose:

- make dashboard and invoice page use the same rules

### Block 6: `window.InventoryApp`

Exports shared config and helpers globally.

## 8.15 `public/js/app-shell.js`

Purpose:

- shared sidebar renderer for dashboard and invoice pages

Main code blocks inside this file:

### Block 1: base config and Android bridge hook

Includes:

- footer text
- brand description
- `syncAndroidSidebarGestureLock`

Note:

- the Android wrapper code is not inside this repository
- this file only talks to it if wrapper bridge exists

### Block 2: sidebar CSS injection

What it does:

- stores shared sidebar CSS in JS
- injects it into page `<head>`

### Block 3: shell creation

Functions:

- `ensureStyles`
- `ensureShell`
- `syncFooterText`

Purpose:

- build sidebar toggle, overlay, brand, nav container, footer

### Block 4: button markup builders

Functions:

- `buildMetaAttributes`
- `buildDashboardButton`
- `buildInvoiceButton`

Purpose:

- render correct sidebar buttons depending on page type

### Block 5: `renderSidebar(pageType)`

Purpose:

- build final sidebar nav HTML
- append logout button

### Block 6: `setupSidebar(pageType, options)`

Purpose:

- attach click handlers
- open/close/toggle sidebar
- lock body scroll on mobile
- manage overlay
- prevent touch scroll leakage
- notify Android wrapper when sidebar is open

This is the main shared behavior layer for sidebar interactions.

## 8.16 `public/js/chart.min.js`

Purpose:

- third-party minified Chart.js file

You normally do not edit this manually.

## 8.17 `public/js/dashboard.js`

Purpose:

- main dashboard controller for `index.html`

This is a large file because it owns many dashboard features.

Main code blocks inside this file:

### Block 1: app config + global state

Includes:

- app config
- API base
- in-memory state
- formatter objects
- shared DOM cache object

### Block 2: general helpers

Functions:

- token/auth headers
- number/date/currency formatting
- safe file naming
- HTML escaping

Purpose:

- shared utility layer for the rest of the file

### Block 3: permission/session helpers

Functions:

- `isAdminSession`
- `normalizeStaffPermissions`
- `canAccessPermission`
- `canAccessSection`
- `getFirstAccessibleSection`

Purpose:

- show only allowed dashboard sections

### Block 4: DOM caching

Function:

- `cacheElements()`

Purpose:

- collects all important DOM references once

### Block 5: fetch/download helpers

Functions:

- `fetchJSON`
- `downloadAuthenticatedFile`
- `logoutAndRedirect`

Purpose:

- centralize auth API calls and file downloads

### Block 6: popup and section UI helpers

Functions:

- `showPopup`
- `hidePopup`
- `updateCurrentDateLabel`
- `applySessionAccess`
- `updateSectionMeta`
- `setActiveSection`

Purpose:

- common dashboard UX

### Block 7: stock form logic

Functions:

- `normalizeProfitPercentValue`
- `updateProfitPreview`
- `updateSellingRate`
- `updateProfitPercent`
- `saveProfitPercentDefault`
- `queueProfitPercentSave`
- `loadProfitPercentDefault`
- `addStock`

Purpose:

- add stock
- auto manage selling rate/profit percent
- store default profit percent in DB

### Block 8: dashboard overview

Functions:

- `updateHeroSummary`
- `loadDashboardOverview`

Purpose:

- top KPI cards for admin dashboard

### Block 9: item report + stock alert UI

Functions:

- `renderItemReport`
- `loadItemReport`
- `updateLowStockOverview`
- `renderReorderPlanner`
- `renderLowStock`
- `loadLowStock`

Purpose:

- stock visibility and reorder planning

### Block 10: sales report UI

Functions:

- `validateSalesDates`
- `renderSalesReport`
- `loadSalesReport`
- `downloadSalesPDF`
- `downloadSalesExcel`

Purpose:

- preview and export sales reports

### Block 11: GST report UI

Functions:

- `validateGstDates`
- `buildGstInsights`
- `renderGstAdvancedSummary`
- `renderGstReport`
- `loadGstReport`
- `downloadGstPDF`
- `downloadGstExcel`

Purpose:

- preview and export GST reports
- compute extra summaries for UI

### Block 12: customer due UI

Functions:

- `submitDebt`
- `loadCustomerSuggestions`
- `renderCustomerDropdown`
- `renderLedgerTable`
- `searchLedger`
- `showAllDues`

Purpose:

- create dues
- search customer ledger
- show all dues summary

### Block 13: chart UI

Functions:

- `loadBusinessTrend`
- `renderBusinessTrend`
- `updateGrowthBadge`
- `initYearFilter`
- `loadLast13MonthsChart`
- `renderLast13MonthsChart`

Purpose:

- sales and profit analytics charts

### Block 14: staff access UI

Functions:

- `normalizeStaffUsername`
- `renderStaffPermissionGrid`
- `readStaffPermissionSelection`
- `setStaffPermissionSelection`
- `renderStaffPermissionBadges`
- `resetStaffForm`
- `renderStaffList`
- `loadStaffAccounts`
- `createStaffAccount`

Purpose:

- full staff access control UI on dashboard

### Block 15: event binding

Functions:

- `bindPopupEvents`
- `bindInventoryEvents`
- `bindReportEvents`
- `bindCustomerDueEvents`
- `bindStaffEvents`

Purpose:

- connect DOM actions to logic

### Block 16: final bootstrap

At the bottom of the file:

- cache DOM
- render shared sidebar
- bind events
- check session
- load user access
- load initial data
- show first allowed section

## 8.18 `public/index.html`

Purpose:

- main dashboard workspace page

Important page sections inside this file:

### Overview section

Shows:

- catalog count
- inventory value
- low stock count
- due balance

### `addStockSection`

Contains:

- item search
- quantity
- profit %
- buying rate
- selling rate
- add stock action

### `itemReportSection`

Contains:

- item report search
- load report
- export PDF
- stock report table

### Low stock and reorder planner cards

Shows:

- low stock list
- reorder candidate count
- urgent count
- suggested units
- estimated reorder cost

### `salesReportSection`

Contains:

- date range
- sales preview
- PDF export
- Excel export
- business trend chart
- last 13 months chart

### `gstReportSection`

Contains:

- date range
- GST preview
- PDF export
- Excel export
- KPI cards
- monthly summary
- rate summary

### `customerDebtSection`

Contains:

- due entry form
- customer lookup
- full ledger view
- all dues summary

### `staffAccessSection`

Contains:

- staff create form
- permission picker
- staff list table

### Shared popup

Used by dashboard.js for status messages.

Script files loaded by this page:

- `js/chart.min.js`
- `js/permission-contract.js`
- `js/app-core.js`
- `js/app-shell.js`
- `js/dashboard.js`

## 8.19 `public/invoice.html`

Purpose:

- invoice workspace page

This page has two parts:

- page HTML layout
- one large inline script that controls invoice behavior

Important UI sections inside this file:

### Hero summary area

Shows:

- invoice number
- invoice date
- draft status
- current line count
- customer/profile completion

### Customer information card

Fields:

- customer name
- contact
- address

### Invoice item builder

Table-based line item editor for:

- item search
- quantity
- rate
- GST/amount totals

### Invoice summary card

Shows:

- subtotal
- GST
- grand total
- invoice metadata
- submit and clear actions

### Shop profile section

Fields:

- shop name
- shop address
- GST number
- GST rate

### Invoice history section

Allows:

- invoice search
- open invoice detail
- PDF download

### Modals

- download confirmation
- save confirmation
- common popup

Main inline script blocks inside this file:

### Block 1: config and formatting helpers

Includes:

- API prefix
- token
- draft key
- money/date/percent formatters

### Block 2: auth wrapper

Function:

- `authFetch`

Purpose:

- sends auth token
- redirects to login on 401

### Block 3: DOM cache

Collects all important invoice page elements.

### Block 4: session and permission handling

Functions:

- `applySessionAccess`
- `loadSession`
- `goToDashboardSection`
- `logoutAndRedirect`

Purpose:

- keep invoice page permission-aware like dashboard

### Block 5: modal, popup, and draft state helpers

Functions:

- `openModal`
- `closeModal`
- `setDraftState`
- `showPopup`
- `hidePopup`

### Block 6: invoice meta and counters

Functions:

- `updateSearchStatus`
- `updateInvoiceMeta`
- `updateProfile`
- `updateCounts`
- `updateGst`

### Block 7: draft system

Functions:

- `buildDraft`
- `saveDraft`
- `queueDraft`
- `restoreDraft`
- `resetInvoice`

Purpose:

- autosave invoice draft in browser localStorage

### Block 8: item row builder

Function:

- `addItemRow(...)`

Purpose:

- creates one invoice row
- supports autocomplete
- fetches item info
- calculates row totals
- handles remove row button

### Block 9: data loading helpers

Functions:

- `loadItemNames`
- `loadInvoiceNumbers`
- `loadShopInfo`
- `loadNewInvoice`

### Block 10: invoice history renderer

Functions:

- `renderEmpty`
- `renderDetail`
- `bindHistory`
- `renderList`
- `loadExact`
- `performSearch`

Purpose:

- invoice history search and detail preview

### Block 11: shop profile save

Function:

- `saveShopProfile`

### Block 12: invoice submit flow

Functions:

- `payload`
- `preCheck`
- `submitInvoice`

Purpose:

- validate invoice before save
- send invoice to backend
- reset draft
- refresh next invoice number and invoice history

### Block 13: final init block

Bottom async IIFE:

- loads session
- loads names, invoice numbers, shop info, new invoice
- restores draft if available
- loads latest invoice history

## 8.20 `public/login.html`

Purpose:

- landing page + all auth modal flows

Main UI parts inside this file:

### Marketing/landing content

Shows:

- app highlights
- workflow explanation
- feature cards
- support section

### Dock buttons

Quick actions:

- Login
- Sign Up
- Staff Login
- Install App / Download APK
- Forgot Password

### Auth modal

Contains forms:

- admin login
- staff login
- register
- forgot password

Main script blocks inside this file:

### Script block 1

Defines:

- `window.APP_DOWNLOAD_URL`

Purpose:

- central static APK download link

### Script block 2

This is the main page controller.

Important parts:

- auth modal open/close
- form switching
- validation
- form status messages
- password show/hide
- API posting
- login/register/forgot submit logic
- footer popup handling
- install/download button behavior

Important auth behaviors now present:

- admin login accepts email or mobile number
- register requires mobile number
- forgot password stays email-only

## 8.21 `public/reset.html`

Purpose:

- password reset page from email link

Main code blocks inside this file:

### Block 1: simple premium page layout

Contains:

- brand bar
- reset card
- helper info strip
- form area

### Block 2: status and field helpers

Functions:

- `resetInputState`
- `setInputState`
- `clearStatus`
- `setStatus`
- `setPendingState`

### Block 3: query parameter bootstrap

What it does:

- reads `email` and `token` from URL
- pre-fills the email field
- decides initial status message

### Block 4: `validateForm`

What it does:

- validates email
- validates token presence
- validates password length
- validates confirm password match

### Block 5: submit handler

What it does:

- POSTs to `/api/auth/reset-password`
- shows success/error
- redirects to login on success

### Block 6: password toggle and blur validation

What it does:

- show/hide password
- live field hint updates

## 8.22 `public/images/app_logo.png`

Purpose:

- brand logo image

## 8.23 `docs/ARCHITECTURE.md`

Purpose:

- shorter architecture-focused document

This new document is the full expanded guide.

## 9. Database table guide in easy language

This section explains the main database tables in simple language.

If you forget what data is stored where, read this section first.

## 9.1 `users`

Purpose:

- stores the main business owner account

Important columns:

- `id` -> primary ID of the owner
- `name` -> shop owner name
- `email` -> login email
- `mobile_number` -> 10 digit mobile number
- `password_hash` -> encrypted password
- `reset_token` -> forgot password token
- `reset_token_expires` -> token expiry time
- `created_at`, `updated_at` -> timestamps

Used by:

- register
- admin login
- forgot password
- reset password
- owner identity across the whole app

## 9.2 `staff_accounts`

Purpose:

- stores sub-user accounts under one owner

Important columns:

- `owner_user_id` -> which admin this staff belongs to
- `name` -> staff name
- `username` -> staff login username
- `password_hash` -> encrypted password
- `page_permissions` -> array of allowed page keys
- `is_active` -> active or disabled

Used by:

- staff login
- permission control
- staff management page

## 9.3 `items`

Purpose:

- stores stock items for one owner

Important columns:

- `user_id` -> item owner
- `name` -> item name
- `quantity` -> available stock
- `buying_rate` -> buying price
- `selling_rate` -> selling price
- `created_at`, `updated_at` -> timestamps

Used by:

- add stock
- item lookup
- invoice stock deduction
- stock report
- low stock report
- reorder planner

## 9.4 `sales`

Purpose:

- stores item-wise sale history

Important columns:

- `user_id` -> owner
- `item_id` -> sold item
- `quantity` -> sold quantity
- `selling_price` -> per-unit selling price
- `total_price` -> total line amount
- `created_at` -> sale time

Used by:

- sales report
- dashboard metrics
- charts
- stock sold calculation

Important note:

- negative quantity is also allowed through invoice return flow
- that is how item return/negative sale is represented

## 9.5 `debts`

Purpose:

- stores customer due ledger rows

Important columns:

- `user_id` -> owner
- `customer_name`
- `customer_number`
- `total` -> billed amount
- `credit` -> paid amount
- `balance` -> auto generated as `total - credit`
- `remark`

Used by:

- customer due page
- customer ledger search
- due summary

## 9.6 `settings`

Purpose:

- stores one row of business-level settings per owner

Important columns:

- `user_id`
- `shop_name`
- `shop_address`
- `gst_no`
- `gst_rate`
- `default_profit_percent`

Used by:

- invoice header/shop profile
- GST calculations
- default profit percent in add stock form

## 9.7 `invoices`

Purpose:

- stores main invoice header data

Important columns:

- `user_id`
- `invoice_no`
- `gst_no`
- `customer_name`
- `contact`
- `address`
- `date`
- `subtotal`
- `gst_amount`
- `total_amount`

Used by:

- invoice history
- invoice detail view
- GST reports
- invoice PDF

## 9.8 `invoice_items`

Purpose:

- stores line items under one invoice

Important columns:

- `invoice_id`
- `description`
- `quantity`
- `rate`
- `amount`

Used by:

- invoice detail page
- invoice PDF
- GST calculations

## 9.9 `user_invoice_counter`

Purpose:

- stores per-user daily running invoice serial

Important columns:

- `user_id`
- `date_key`
- `next_no`

Used by:

- generating invoice number like daily sequence style

## 10. API route map

This section is a quick route cheat sheet.

If you want to know which page talks to which backend endpoint, this section helps.

## 10.1 Auth routes from `routes/auth.js`

- `POST /api/auth/register` -> create admin account
- `POST /api/auth/login` -> admin login by email or mobile
- `POST /api/auth/staff/login` -> staff login by username
- `POST /api/auth/logout` -> clear session
- `POST /api/auth/forgot-password` -> send reset link by email
- `POST /api/auth/reset-password` -> save new password
- `GET /api/auth/staff` -> get all staff accounts
- `POST /api/auth/staff` -> create staff account
- `PATCH /api/auth/staff/:staffId/permissions` -> update staff permissions
- `DELETE /api/auth/staff/:staffId` -> delete staff
- `GET /api/auth/me` -> get current logged-in user

## 10.2 Inventory routes from `routes/inventory.js`

- `GET /api/stock-defaults` -> load default profit percent
- `PUT /api/stock-defaults` -> update default profit percent
- `POST /api/items` -> create/update stock item
- `GET /api/items/names` -> item name suggestion
- `GET /api/items/info` -> item detail by name
- `GET /api/items/report` -> stock report data
- `GET /api/items/report/pdf` -> stock report PDF
- `GET /api/items/low-stock` -> low stock list
- `GET /api/items/reorder-suggestions` -> reorder planner list
- `GET /api/sales/report` -> sales report
- `GET /api/sales/report/pdf` -> sales report PDF
- `GET /api/sales/report/excel` -> sales report Excel
- `GET /api/gst/report` -> GST report
- `GET /api/gst/report/pdf` -> GST PDF
- `GET /api/gst/report/excel` -> GST Excel
- `POST /api/debts` -> add due row
- `GET /api/debts/customers` -> customer search for due module
- `GET /api/debts/:number` -> one customer ledger
- `GET /api/debts` -> all due rows
- `GET /api/dashboard/overview` -> dashboard totals
- `GET /api/sales/monthly-trend` -> chart data
- `GET /api/sales/last-13-months` -> chart data

## 10.3 Invoice routes from `routes/invoices.js`

- `GET /api/invoices/new` -> get next invoice number preview
- `POST /api/invoices` -> create invoice and update stock
- `GET /api/invoices/history` -> invoice list
- `GET /api/invoices/:invoiceNo` -> invoice detail
- `GET /api/invoices/:invoiceNo/pdf` -> invoice PDF
- `GET /api/shop-info` -> load invoice shop profile
- `POST /api/shop-info` -> save invoice shop profile

## 11. Environment variables and why they matter

The app depends on some environment variables.

If these are wrong, the app may fail even if the code is correct.

## 11.1 Main variables

- `DATABASE_URL` -> PostgreSQL connection string
- `DB_SSL` -> controls SSL mode for DB connection
- `JWT_SECRET` -> signs and verifies login tokens
- `PORT` -> backend server port
- `NODE_ENV` -> production or development behavior
- `CORS_ALLOWED_ORIGINS` -> allowed browser origins
- `BASE_URL` -> used when generating password reset link
- `MAIL_RELAY_URL` -> endpoint used to send reset email
- `MAIL_RELAY_KEY` -> auth key for mail relay

## 11.2 What breaks if a variable is wrong

- wrong `DATABASE_URL` -> app cannot start or cannot query data
- wrong `JWT_SECRET` -> login and protected routes break
- wrong `BASE_URL` -> reset link opens wrong domain
- wrong `MAIL_RELAY_URL` or `MAIL_RELAY_KEY` -> forgot password mail fails
- wrong `CORS_ALLOWED_ORIGINS` -> browser requests may be blocked

## 12. Which file to edit for which change

This is a very practical maintenance section.

When you want to change something in future, use this quick guide.

## 12.1 If you want to change login/register behavior

Edit:

- `public/login.html`
- `routes/auth.js`
- maybe `middleware/auth.js`

Examples:

- new register field
- login validation change
- new auth rule
- forgot password behavior

## 12.2 If you want to change sidebar or common navigation

Edit:

- `public/js/app-core.js`
- `public/js/app-shell.js`
- maybe `public/js/permission-contract.js`

Examples:

- new sidebar button
- remove menu item
- rename menu label
- change page permission mapping

## 12.3 If you want to change dashboard features

Edit:

- `public/index.html`
- `public/js/dashboard.js`
- `routes/inventory.js`

Examples:

- add a new report card
- change dashboard chart
- add new stock form field
- add new due module feature

## 12.4 If you want to change invoice flow

Edit:

- `public/invoice.html`
- `routes/invoices.js`
- maybe `routes/inventory.js`

Examples:

- invoice layout
- invoice validation
- invoice numbering logic
- stock deduction logic
- PDF invoice design

## 12.5 If you want to change database schema

Edit:

- `migrations/full_updated_schema.sql`
- add a new file inside `migrations/`
- maybe `db.js` if startup compatibility patch is needed
- affected route files
- affected frontend files

## 12.6 If you want to change staff permission model

Edit:

- `public/js/permission-contract.js`
- `public/js/app-core.js`
- `middleware/auth.js`
- `routes/auth.js`

## 12.7 If you want to change PDF or Excel export

Edit:

- mostly `routes/inventory.js`
- sometimes `routes/invoices.js`

## 13. Ownership model and permission model

This is one of the most important architectural ideas in the app.

## 13.1 Owner-based data model

The app is built around the owner account.

That means:

- items belong to owner
- invoices belong to owner
- dues belong to owner
- settings belong to owner
- staff accounts only act under owner

So staff do not create separate business spaces.

This is why many queries use:

- `getUserId(req)`

That helper resolves the real owner ID even if the session is a staff session.

## 13.2 Actor-based action model

The app also tracks who is acting in the session.

That is why there is also:

- `getActorId(req)`

Meaning:

- owner ID tells whose business data it is
- actor ID tells who is currently performing the action

## 13.3 Permission enforcement

Permission checks happen in two places:

- frontend hides blocked sections/buttons
- backend blocks restricted API routes

This is the correct approach.

Frontend-only permission would not be secure.

## 14. Important design choices in this project

## 14.1 Static HTML instead of frontend framework

Why it is useful:

- simple hosting
- less build complexity
- easy direct editing

Tradeoff:

- large files can become harder to maintain
- manual DOM handling grows over time

## 14.2 Shared sidebar extracted into reusable JS

Why it is useful:

- same sidebar across main pages
- one place to maintain sidebar behavior
- mobile fixes are easier

## 14.3 Route files grouped by business function

Why it is useful:

- auth logic stays in one place
- inventory/report logic stays in one place
- invoice logic stays in one place

## 14.4 Database-first business settings

Example:

- default profit percent is stored in `settings`

Why it is useful:

- same business setting works across devices
- browser-local state is reduced

## 15. Practical workflow for future developers

If a new developer joins later, this is the easiest learning order:

1. Read this document fully once
2. Read `server.js`
3. Read `routes/auth.js`
4. Read `routes/inventory.js`
5. Read `routes/invoices.js`
6. Read `public/js/app-core.js`
7. Read `public/js/app-shell.js`
8. Read `public/js/dashboard.js`
9. Read `public/index.html`
10. Read `public/invoice.html`

That order gives a good mental map quickly.

## 16. Recommended future improvements

These are not bugs.

These are future maintainability improvements.

## 16.1 Split large frontend scripts

Best candidate files:

- `public/js/dashboard.js`
- inline script in `public/invoice.html`
- large script in `public/login.html`

Why:

- easier debugging
- smaller review scope
- lower chance of accidental breakage

## 16.2 Add service layer on backend

Right now route files contain a lot of business logic directly.

Future improvement:

- add `services/` folder
- move heavy stock, report, invoice logic into services

## 16.3 Add central constants for API routes and messages

Why:

- fewer repeated strings
- safer refactor

## 16.4 Add automated tests

High-value first tests:

- auth register/login/reset
- invoice creation and stock deduction
- negative quantity return flow
- due calculations
- default profit percent saving

## 16.5 Add more docs over time

Useful future docs:

- deployment checklist
- release checklist
- backup/restore guide
- database migration guide
- Android wrapper guide

## 17. Final summary

This project is a full business inventory system with:

- account system
- stock management
- invoice generation
- reports
- GST tools
- due tracking
- staff permissions

The project structure is already meaningful:

- backend logic is mainly in `routes/`
- auth protection is in `middleware/`
- database connection is in `db.js`
- page UI is in `public/*.html`
- reusable frontend logic is in `public/js/`

If you forget anything later, this document should be your first reference before scanning the whole project again.
