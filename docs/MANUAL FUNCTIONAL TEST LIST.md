# India Inventory Management Manual Functional Test Checklist

Last updated against this repository: `2026-03-29`

## Purpose

This document is the end-to-end manual functional testing guide for the full app.

Use it for:

- release testing before deployment
- regression testing after backend or frontend changes
- smoke testing after bug fixes
- role-based access verification
- mobile, tablet, and desktop UI validation

This checklist is intentionally broad and covers the app from multiple angles:

- happy path
- validation failures
- permission boundaries
- data integrity
- report/export flows
- responsive behavior
- session and stability behavior
- deployment health and runtime verification

## Test Scope

Main application areas included:

- owner authentication
- staff authentication
- sidebar navigation and page access control
- dashboard overview
- stock entry
- purchase entry
- supplier ledger and supplier repayment
- invoice creation and invoice history
- invoice payment collection
- customer due ledger
- stock report
- sales report
- GST report
- expense tracking
- staff management
- session handling and logout
- browser responsiveness and UI stability
- deployment healthchecks and post-deploy runtime stability

## Test Matrix

Run the checklist across the following combinations as much as practical.

### Roles

- owner
- staff with limited permissions
- staff with sales-only permissions
- staff with no dashboard pages except invoice, if applicable

### Viewports

- desktop: `1366x768` or wider
- tablet: `768x1024`
- mobile: `360x800` and `393x851`

### Browsers

- Chrome or Edge
- one additional browser if available

### Network Conditions

- normal connection
- occasional slow connection
- one temporary offline/retry test

## Test Data Setup

Prepare the following before testing:

- 1 owner account
- 2 staff accounts with different permission sets
- 3 to 5 item records with different stock quantities
- 1 low-stock item
- 2 suppliers
- 2 customer due ledgers
- 2 invoices marked paid
- 1 invoice marked partial
- 1 invoice marked due
- 2 expenses
- 1 purchase marked paid
- 1 purchase marked due or partial

Recommended sample test values:

- item names with normal words
- one item name with mixed case
- one supplier with mobile number
- one customer with valid 10-digit number
- one customer with multiple due entries

## Global Pass Conditions

These should remain true during the entire test run:

- no uncaught JavaScript errors in browser console
- no broken layout on desktop, tablet, or mobile
- no page becomes blank or unusable after save/search/navigation
- no duplicate submit, duplicate popup, or duplicate row creation from one click
- unauthorized access is blocked gracefully
- saved data appears correctly after reload
- app remains responsive during repeated searches and section switching
- health endpoints respond without authentication
- no immediate post-deploy container restart loop is visible in runtime logs

## Pre-Flight Checks

- [ ] App starts successfully and login page opens.
- [ ] `GET /health` returns `200` with JSON `status: "ok"` and DB readiness marked true.
- [ ] `GET /api/health` returns `200` without requiring login.
- [ ] `GET /readyz` and `GET /livez` return healthy responses.
- [ ] Health responses include `X-Request-Id` header.
- [ ] Browser console shows no startup error.
- [ ] Main CSS, icons, images, and scripts load properly.
- [ ] Login page remains usable on mobile width.
- [ ] Refreshing the page does not break the shell or styles.
- [ ] In production, `/debug-env` and `/debug-db` are unavailable unless intentionally enabled.
- [ ] Post-deploy runtime logs show startup events cleanly:
  Expected: `app_bootstrap_started`, `db_connection_ready`, `db_schema_ready`, and `application_ready`.

## 1. Authentication And Session

### Owner Login

- [ ] Login with valid email and password.
  Expected: dashboard opens with full access.
- [ ] Login with valid mobile number and password.
  Expected: same owner account opens correctly.
- [ ] Login with invalid email.
  Expected: clear error message, no session created.
- [ ] Login with invalid mobile number format.
  Expected: validation error before or after request, no broken flow.
- [ ] Login with wrong password.
  Expected: clear error message.
- [ ] Repeated wrong login attempts.
  Expected: rate limit behavior appears cleanly.

### Staff Login

- [ ] Staff login with valid username and password.
  Expected: login succeeds and only assigned sections are visible.
- [ ] Staff login with inactive or deleted account.
  Expected: blocked with error.
- [ ] Wrong staff password.
  Expected: error shown, session not created.

### Session Persistence

- [ ] Refresh dashboard after owner login.
  Expected: still logged in.
- [ ] Refresh invoice page after login.
  Expected: still logged in.
- [ ] Open protected page without session.
  Expected: redirected to login or blocked cleanly.
- [ ] Logout from dashboard.
  Expected: session clears and returns to login.
- [ ] Logout from invoice page.
  Expected: same result.

### Password Reset

- [ ] Forgot-password request with valid email.
  Expected: generic success message.
- [ ] Forgot-password request with unknown email.
  Expected: same generic success style, no leak.
- [ ] Reset password with valid token.
  Expected: login works with new password.
- [ ] Reset password with invalid or expired token.
  Expected: clear error.

## 2. Role Access And Sidebar

- [ ] Owner sees all available business sections.
- [ ] Sales-only staff sees invoice page and only assigned sections.
- [ ] Staff without `customer_due` cannot use customer due page.
- [ ] Staff without `purchase_entry` cannot use purchase pages.
- [ ] Staff without `expense_tracking` cannot use expenses page.
- [ ] Staff without dashboard sections but with invoice access opens invoice page correctly.
- [ ] Clicking sidebar items changes section correctly.
- [ ] Current section remains consistent after reload if still allowed.
- [ ] If saved last section is no longer allowed, app falls back to a valid section.

### Mobile Sidebar

- [ ] Sidebar opens from mobile toggle button.
- [ ] Overlay click closes sidebar.
- [ ] Section click closes sidebar on mobile.
- [ ] Background scroll stays locked while sidebar is open.
- [ ] Repeated open/close does not freeze page.

## 3. Dashboard Overview

- [ ] Dashboard overview cards load values for stock, due, supplier due, and profit.
- [ ] Overview values update after add stock.
- [ ] Overview values update after purchase.
- [ ] Overview values update after expense add.
- [ ] Overview values update after customer due save.
- [ ] Overview values update after invoice save and invoice payment collection.
- [ ] No `NaN`, blank, or malformed amount appears in stats.

## 4. Stock Entry

### Add New Item

- [ ] Add a brand new stock item with quantity, buying rate, and selling rate.
  Expected: success popup and data persists.
- [ ] Add another item with decimal rates.
  Expected: amount formatting remains correct.

### Existing Item Update

- [ ] Search existing item name from suggestion list.
- [ ] Add additional quantity to existing item.
  Expected: stock increases correctly.
- [ ] Previous buying rate appears when existing item is selected.

### Validation

- [ ] Empty item name.
  Expected: blocked.
- [ ] Zero or invalid quantity.
  Expected: blocked if invalid.
- [ ] Negative buying or selling value.
  Expected: blocked.
- [ ] Press Enter from input fields.
  Expected: one clean submit only.

### UX And Stability

- [ ] Item autocomplete remains fast while typing quickly.
- [ ] No duplicate suggestion event or flicker after repeated usage.
- [ ] Mobile layout stays readable.

## 5. Purchase Entry

### Supplier Capture

- [ ] Search supplier by name.
  Expected: suggestion list appears.
- [ ] Select existing supplier.
  Expected: number and address fill correctly.
- [ ] Enter new supplier manually.
  Expected: purchase still saves if flow supports it.

### Purchase Save

- [ ] Save paid purchase with multiple items.
  Expected: purchase report updates, stock increases.
- [ ] Save due purchase.
  Expected: supplier due appears correctly.
- [ ] Save partial purchase.
  Expected: paid and due split correctly.
- [ ] Save purchase with note.
  Expected: note visible in details if supported.

### Purchase Search And Detail

- [ ] Search purchases by bill or supplier in valid date range.
  Expected: dropdown suggestions appear.
- [ ] Open a purchase detail from search/report list.
  Expected: exact purchase detail opens with item list.
- [ ] Search with invalid date range.
  Expected: clean validation message.

### Purchase Validation

- [ ] Missing supplier.
- [ ] Missing item row.
- [ ] Invalid quantity.
- [ ] Credit greater than subtotal if applicable.
- [ ] Invalid paid amount.
  Expected for all: blocked gracefully.

## 6. Supplier Ledger And Supplier Repayment

- [ ] Open full supplier summary.
  Expected: all suppliers and balances visible.
- [ ] Click one supplier row.
  Expected: ledger/detail opens correctly.
- [ ] Search supplier ledger directly.
  Expected: same supplier opens.
- [ ] Submit repayment against supplier due.
  Expected: due reduces and ledger updates.
- [ ] Fully settle supplier due.
  Expected: balance reaches zero without negative drift.
- [ ] Mobile layout remains readable.

## 7. Invoice Creation

### Initial Load

- [ ] Invoice page opens without visible lag or broken UI.
- [ ] New invoice number loads correctly.
- [ ] Shop info loads correctly.
- [ ] Draft status UI behaves normally.

### Item Rows

- [ ] Add first invoice row.
- [ ] Add multiple invoice rows.
- [ ] Remove one row.
- [ ] Item autocomplete works.
- [ ] Existing stock quantity check appears correctly.
- [ ] Changing quantity/rate/amount recalculates totals.

### Payment Modes And Totals

- [ ] Cash invoice with full payment.
  Expected: payment status paid.
- [ ] Partial payment invoice.
  Expected: payment status partial and due amount correct.
- [ ] Full due invoice.
  Expected: payment status due and due amount correct.
- [ ] Change payment mode between cash, UPI, bank, mixed, or credit as supported.
  Expected: UI and summary remain correct.

### Submit And Post-Save

- [ ] Save fully paid invoice.
  Expected: searchable in history and downloadable.
- [ ] Save partial invoice.
  Expected: linked due entry created correctly.
- [ ] Save due invoice.
  Expected: customer due ledger updates correctly.
- [ ] Save invoice after low stock scenario.
  Expected: pre-check blocks or handles correctly.
- [ ] After save, new invoice number refreshes correctly.

### Draft Handling

- [ ] Modify invoice fields and wait.
  Expected: draft autosaves.
- [ ] Reload page before submit.
  Expected: draft restores correctly.
- [ ] Clear invoice.
  Expected: draft and UI reset correctly.

## 8. Invoice Search, Detail, Download, And Settlement

### Search

- [ ] Search exact invoice number.
  Expected: exact invoice opens.
- [ ] Search partial invoice number.
  Expected: list or suggestions appear.
- [ ] Search by customer name.
  Expected: related invoices show.
- [ ] Search by contact number.
  Expected: related invoices show.
- [ ] Empty search.
  Expected: latest invoice list appears.

### Detail View

- [ ] Open invoice detail from search result.
  Expected: summary, line items, GST, totals all match saved data.
- [ ] Payment status chip matches actual status.
- [ ] Customer address/contact fields display correctly.
- [ ] Settlement history appears for due/partial invoices.

### Download

- [ ] Download PDF from exact invoice detail.
- [ ] Download PDF from invoice list action.
  Expected: file downloads successfully both ways.

### Payment Collection

- [ ] Receive payment against due invoice.
  Expected: invoice paid/due values change correctly.
- [ ] Receive partial collection against due invoice.
  Expected: invoice remains partial with updated due.
- [ ] Receive payment with note.
  Expected: settlement note persists.
- [ ] Payment collection reflects in customer due ledger.
  Expected: invoice and due remain in sync.

## 9. Customer Due Ledger

### New Due Entry

- [ ] Add manual due with name, number, total, and note.
  Expected: summary updates.
- [ ] Add credit-only entry for existing due customer.
  Expected: due reduces or linked invoices settle where applicable.
- [ ] Add entry with total and credit together.
  Expected: balance is calculated correctly.

### Suggestions And Search

- [ ] Type customer number in due form.
  Expected: existing ledger suggestions appear.
- [ ] Select suggested customer.
  Expected: name auto-fills and locked behavior works.
- [ ] Search ledger by number.
  Expected: single customer timeline opens.
- [ ] Search ledger by suggestion dropdown.
  Expected: same result.

### Summary And Detail

- [ ] Show all customers.
  Expected: summary rows appear.
- [ ] Click summary row.
  Expected: exact ledger opens.
- [ ] Timeline balance progression is correct entry by entry.
- [ ] Remarks appear correctly.

### Validation

- [ ] Empty customer name.
- [ ] Invalid mobile number.
- [ ] Both total and credit equal zero.
- [ ] Credit greater than total in opening due mode.
  Expected for all: blocked with clear message.

### Data Integrity

- [ ] Create invoice due, then check customer due section.
  Expected: invoice-linked due visible.
- [ ] Collect payment in customer due section, then open invoice.
  Expected: invoice due values update correctly.
- [ ] Collect payment from invoice detail, then open customer due ledger.
  Expected: ledger reflects it correctly.

## 10. Stock Report

- [ ] Search report by exact item name.
- [ ] Load report without search if supported.
- [ ] Low stock list renders correctly.
- [ ] Reorder suggestion list renders correctly.
- [ ] PDF export works.
- [ ] Table remains readable on mobile.

## 11. Sales Report

- [ ] Load report with valid date range.
- [ ] Validate totals against known invoices.
- [ ] PDF export works.
- [ ] Excel export works.
- [ ] Sales net profit card loads correctly.
- [ ] Business trend chart loads when sales section opens.
- [ ] Recent sales chart loads correctly.
- [ ] Reopening section does not duplicate or break chart render.
- [ ] No chart error when visiting non-sales sections first.

## 12. GST Report

- [ ] Load GST report with valid date range.
- [ ] Invoice rows show correct taxable/GST/total values.
- [ ] Monthly summary renders correctly.
- [ ] Rate summary renders correctly.
- [ ] PDF export works.
- [ ] Excel export works.
- [ ] Invalid date range shows clean validation.

## 13. Expense Tracking

- [ ] Add expense entry.
  Expected: success and list/report update.
- [ ] Add multiple categories.
- [ ] Search expense report by text.
- [ ] Load expense report by date range.
- [ ] Dashboard net profit or expense-related cards update correctly.
- [ ] Invalid expense amount is blocked.

## 14. Staff Access Management

### Staff Create

- [ ] Create staff with valid username/password and selected permissions.
  Expected: account appears in list.
- [ ] Try invalid username format.
  Expected: blocked.
- [ ] Try empty permissions.
  Expected: blocked.
- [ ] Try more than 2 staff accounts.
  Expected: blocked by limit.

### Staff Edit

- [ ] Update one staff permission set.
  Expected: save success.
- [ ] Login with that staff afterward.
  Expected: new permissions are reflected.

### Staff Delete

- [ ] Delete one staff account.
  Expected: removed from list.
- [ ] Refresh and verify deleted staff cannot continue normal access.

## 15. Permission Boundary Tests

- [ ] Staff without stock access tries direct stock API-driven action from UI.
  Expected: denied cleanly.
- [ ] Staff without due access tries direct due page action.
  Expected: denied.
- [ ] Staff without purchase access tries supplier/purchase flow.
  Expected: denied.
- [ ] Staff without expense access tries expense section.
  Expected: denied.
- [ ] Owner can still access all routes normally.

## 16. Data Integrity Regression Tests

These are especially important after optimization or backend changes.

- [ ] Add stock, then create invoice using same item.
  Expected: stock decreases correctly after sale.
- [ ] Create purchase for same item.
  Expected: stock increases correctly.
- [ ] Create due invoice.
  Expected: debt row inserted correctly.
- [ ] Receive invoice payment.
  Expected: invoice + debt sync remains correct.
- [ ] Create customer credit from due section.
  Expected: linked invoices update correctly where applicable.
- [ ] Create due purchase and repay supplier.
  Expected: supplier ledger and due totals stay consistent.
- [ ] Add expense and reload dashboard.
  Expected: net/gross related numbers stay consistent.

## 17. Validation And Error Handling

- [ ] Try submitting forms with required fields missing.
- [ ] Try invalid numeric values.
- [ ] Try invalid date ranges.
- [ ] Try invalid mobile number formats.
- [ ] Try expired or cleared session during active use.
  Expected for all: clear error, no broken screen.

### Network And Retry

- [ ] Disconnect network during search.
  Expected: request fails gracefully.
- [ ] Disconnect network during save.
  Expected: clear error, no silent corruption.
- [ ] Reconnect and retry same action.
  Expected: app recovers normally.

## 18. Responsive And UI Stability

Run these on desktop, tablet, and mobile:

- [ ] Login page
- [ ] Dashboard shell
- [ ] Add stock form
- [ ] Purchase entry
- [ ] Supplier ledger
- [ ] Sales report and charts
- [ ] GST report
- [ ] Customer due summary
- [ ] Customer due ledger detail
- [ ] Expense report
- [ ] Invoice page
- [ ] Invoice detail

Check each for:

- [ ] no clipped buttons
- [ ] no unreadable text
- [ ] no overlapping cards
- [ ] no accidental horizontal scroll except where intentional
- [ ] touch targets are tappable
- [ ] keyboard open on mobile does not trap fields badly

## 19. Performance And Stability

- [ ] Rapidly type in item, supplier, purchase, customer due, and invoice searches.
  Expected: no stale or broken dropdown behavior.
- [ ] Switch sections repeatedly for 1 to 2 minutes.
  Expected: no duplicate requests or frozen UI.
- [ ] Open sales section multiple times.
  Expected: charts re-render cleanly.
- [ ] Save several transactions sequentially.
  Expected: app remains responsive.
- [ ] Hard refresh after deployment-style reload.
  Expected: latest UI loads without stale-script break.

## 20. Deployment And Runtime Verification

- [ ] Deploy the latest build and confirm the service becomes healthy without manual restart.
- [ ] Check Railway or host runtime logs immediately after deploy.
  Expected: startup reaches `application_ready` without `SIGTERM`, restart loop, or repeated container stop events.
- [ ] Keep logs open for 5 to 10 minutes after deploy.
  Expected: no unexpected `Stopping Container`, `command failed`, or healthcheck-related shutdown pattern.
- [ ] Visit `/health` after deploy.
  Expected: JSON shows healthy app state, DB ready, server listening, and no shutdown flag.
- [ ] Visit `/api/health` while logged out.
  Expected: endpoint remains publicly reachable and does not redirect to login.
- [ ] If request logging is enabled for diagnostics, verify logs include request IDs and then disable noisy logging before release if not needed.
- [ ] Confirm no authenticated business route was accidentally exposed while adding health endpoints.
  Expected: protected routes still require valid session and permissions.

## 21. Browser Console And Visual Audit

- [ ] No uncaught exception on login page.
- [ ] No uncaught exception on dashboard.
- [ ] No uncaught exception on invoice page.
- [ ] No CSP error that breaks required functionality.
- [ ] No failed image/script request that breaks UI.
- [ ] No obvious visual regression in due ledger, invoice detail, sidebar, or reports.

## 22. Final Release Sign-Off Checklist

- [ ] Owner authentication passed.
- [ ] Staff authentication passed.
- [ ] All permissions behaved correctly.
- [ ] Stock entry passed.
- [ ] Purchase entry passed.
- [ ] Supplier ledger passed.
- [ ] Invoice creation passed.
- [ ] Invoice search/detail/download passed.
- [ ] Invoice payment settlement passed.
- [ ] Customer due passed.
- [ ] Reports passed.
- [ ] Expense tracking passed.
- [ ] Staff access passed.
- [ ] Deployment/runtime health checks passed.
- [ ] Mobile/tablet/desktop layouts passed.
- [ ] Console clean enough for release.
- [ ] No blocker or critical defect remains open.

## Defect Logging Template

Use this template while testing:

```md
Title:
Environment:
Role:
Device/Viewport:
Page/Section:
Precondition:
Steps To Reproduce:
Expected Result:
Actual Result:
Frequency:
Screenshot/Video:
Console Error:
Runtime Log Snippet:
Severity:
```

## Suggested Execution Order

For fastest real-world regression testing, run in this order:

1. pre-flight checks
2. auth and role access
3. dashboard shell and sidebar
4. add stock
5. purchase entry and supplier ledger
6. invoice create, search, download, and settlement
7. customer due
8. reports
9. expenses
10. staff management
11. responsive and performance pass
12. deployment and runtime verification
13. final console and sign-off review
