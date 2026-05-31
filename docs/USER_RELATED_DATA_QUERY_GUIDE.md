# User Related Data Query Guide

Last updated: `2026-05-31`

This guide explains how to check all database data related to one specific application user from pgAdmin.

Schema source: `migrations/full_updated_schema.sql`

## Purpose

Use this when you need to inspect one user's data table-wise, for example user id `7`.

Not every table has a direct `user_id` column. Some tables are linked indirectly through parent tables. So a simple `WHERE user_id = 7` query will not show complete data.

## User Id Location

At the top of the query, change only this line:

```sql
SELECT 7::INT AS user_id
```

Examples:

```sql
SELECT 3::INT AS user_id
SELECT 10::INT AS user_id
```

## Relationship Map

| Table                   | How it belongs to a user                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `users`                 | `users.id = target user id`                                               |
| `staff_accounts`        | `staff_accounts.owner_user_id = users.id`                                 |
| `items`                 | `items.user_id = users.id`                                                |
| `sales`                 | `sales.user_id = users.id` and `sales.item_id = items.id`                 |
| `debts`                 | `debts.user_id = users.id`, optional `debts.invoice_id = invoices.id`     |
| `suppliers`             | `suppliers.user_id = users.id`                                            |
| `purchases`             | `purchases.user_id = users.id` and `purchases.supplier_id = suppliers.id` |
| `purchase_items`        | `purchase_items.purchase_id = purchases.id`                               |
| `expenses`              | `expenses.user_id = users.id`                                             |
| `settings`              | `settings.user_id = users.id`                                             |
| `invoices`              | `invoices.user_id = users.id`                                             |
| `invoice_items`         | `invoice_items.invoice_id = invoices.id`                                  |
| `user_invoice_counter`  | `user_invoice_counter.user_id = users.id`                                 |
| `support_conversations` | `support_conversations.owner_user_id = users.id`                          |
| `support_messages`      | `support_messages.conversation_id = support_conversations.id`             |
| `developer_admins`      | Global developer admin table, not linked to a normal user                 |

## pgAdmin Using Process

1. Open pgAdmin.
2. Select your database.
3. Open Query Tool.
4. Paste the query from the next section.
5. Change `SELECT 7::INT AS user_id` to the user id you want to inspect.
6. Click Execute.
7. Check the result columns:
   - `table_name`: source table name.
   - `row_count`: number of rows found for that user.
   - `data`: table data as JSON.

The `data` column can be opened/expanded in pgAdmin. It is useful because all table-wise data comes in one result grid.

## Full User Related Data Query

This query hides sensitive password and token columns from `users` and `staff_accounts`.

```sql
WITH target AS (
  SELECT 7::INT AS user_id
),
result AS (

  SELECT 1 AS sort_no, 'users' AS table_name, COUNT(*) AS row_count,
    COALESCE(
      jsonb_agg(
        to_jsonb(u) - 'password_hash' - 'verify_token' - 'reset_token'
        ORDER BY u.id
      ),
      '[]'::jsonb
    ) AS data
  FROM public.users u
  JOIN target t ON u.id = t.user_id

  UNION ALL
  SELECT 2, 'staff_accounts', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(sa) - 'password_hash'
        ORDER BY sa.id
      ),
      '[]'::jsonb
    )
  FROM public.staff_accounts sa
  JOIN target t ON sa.owner_user_id = t.user_id

  UNION ALL
  SELECT 3, 'items', COUNT(*),
    COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb)
  FROM public.items i
  JOIN target t ON i.user_id = t.user_id

  UNION ALL
  SELECT 4, 'sales', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(s) || jsonb_build_object('item_name', i.name)
        ORDER BY s.created_at DESC, s.id DESC
      ),
      '[]'::jsonb
    )
  FROM public.sales s
  LEFT JOIN public.items i ON i.id = s.item_id
  JOIN target t ON s.user_id = t.user_id

  UNION ALL
  SELECT 5, 'debts', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(d) || jsonb_build_object('invoice_no', inv.invoice_no)
        ORDER BY d.created_at DESC, d.id DESC
      ),
      '[]'::jsonb
    )
  FROM public.debts d
  LEFT JOIN public.invoices inv ON inv.id = d.invoice_id
  JOIN target t ON d.user_id = t.user_id

  UNION ALL
  SELECT 6, 'suppliers', COUNT(*),
    COALESCE(jsonb_agg(to_jsonb(sp) ORDER BY sp.id), '[]'::jsonb)
  FROM public.suppliers sp
  JOIN target t ON sp.user_id = t.user_id

  UNION ALL
  SELECT 7, 'purchases', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(p) || jsonb_build_object('supplier_name', sp.name)
        ORDER BY p.purchase_date DESC, p.id DESC
      ),
      '[]'::jsonb
    )
  FROM public.purchases p
  LEFT JOIN public.suppliers sp ON sp.id = p.supplier_id
  JOIN target t ON p.user_id = t.user_id

  UNION ALL
  SELECT 8, 'purchase_items', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(pi) || jsonb_build_object(
          'purchase_user_id', p.user_id,
          'purchase_bill_no', p.bill_no,
          'purchase_date', p.purchase_date,
          'supplier_id', p.supplier_id,
          'supplier_name', sp.name
        )
        ORDER BY p.purchase_date DESC, p.id DESC, pi.id
      ),
      '[]'::jsonb
    )
  FROM public.purchase_items pi
  JOIN public.purchases p ON p.id = pi.purchase_id
  LEFT JOIN public.suppliers sp ON sp.id = p.supplier_id
  JOIN target t ON p.user_id = t.user_id

  UNION ALL
  SELECT 9, 'expenses', COUNT(*),
    COALESCE(
      jsonb_agg(to_jsonb(e) ORDER BY e.expense_date DESC, e.id DESC),
      '[]'::jsonb
    )
  FROM public.expenses e
  JOIN target t ON e.user_id = t.user_id

  UNION ALL
  SELECT 10, 'settings', COUNT(*),
    COALESCE(jsonb_agg(to_jsonb(st) ORDER BY st.id), '[]'::jsonb)
  FROM public.settings st
  JOIN target t ON st.user_id = t.user_id

  UNION ALL
  SELECT 11, 'invoices', COUNT(*),
    COALESCE(
      jsonb_agg(to_jsonb(inv) ORDER BY inv.date DESC, inv.id DESC),
      '[]'::jsonb
    )
  FROM public.invoices inv
  JOIN target t ON inv.user_id = t.user_id

  UNION ALL
  SELECT 12, 'invoice_items', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(ii) || jsonb_build_object(
          'invoice_user_id', inv.user_id,
          'invoice_no', inv.invoice_no,
          'invoice_date', inv.date,
          'customer_name', inv.customer_name,
          'contact', inv.contact
        )
        ORDER BY inv.date DESC, inv.id DESC, ii.id
      ),
      '[]'::jsonb
    )
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  JOIN target t ON inv.user_id = t.user_id

  UNION ALL
  SELECT 13, 'user_invoice_counter', COUNT(*),
    COALESCE(
      jsonb_agg(to_jsonb(uic) ORDER BY uic.date_key DESC),
      '[]'::jsonb
    )
  FROM public.user_invoice_counter uic
  JOIN target t ON uic.user_id = t.user_id

  UNION ALL
  SELECT 14, 'support_conversations', COUNT(*),
    COALESCE(
      jsonb_agg(to_jsonb(sc) ORDER BY sc.updated_at DESC, sc.id DESC),
      '[]'::jsonb
    )
  FROM public.support_conversations sc
  JOIN target t ON sc.owner_user_id = t.user_id

  UNION ALL
  SELECT 15, 'support_messages', COUNT(*),
    COALESCE(
      jsonb_agg(
        to_jsonb(sm) || jsonb_build_object(
          'owner_user_id', sc.owner_user_id,
          'conversation_status', sc.status,
          'requester_role', sc.requester_role,
          'requester_name', sc.requester_name
        )
        ORDER BY sm.created_at ASC, sm.id ASC
      ),
      '[]'::jsonb
    )
  FROM public.support_messages sm
  JOIN public.support_conversations sc ON sc.id = sm.conversation_id
  JOIN target t ON sc.owner_user_id = t.user_id

)
SELECT table_name, row_count, data
FROM result
ORDER BY sort_no;
```

## Only Count Check

Use this first when you only want to know which tables have data for the user.

```sql
WITH target AS (
  SELECT 7::INT AS user_id
)
SELECT 'users' AS table_name, COUNT(*) AS row_count
FROM public.users u
JOIN target t ON u.id = t.user_id

UNION ALL
SELECT 'staff_accounts', COUNT(*)
FROM public.staff_accounts sa
JOIN target t ON sa.owner_user_id = t.user_id

UNION ALL
SELECT 'items', COUNT(*)
FROM public.items i
JOIN target t ON i.user_id = t.user_id

UNION ALL
SELECT 'sales', COUNT(*)
FROM public.sales s
JOIN target t ON s.user_id = t.user_id

UNION ALL
SELECT 'debts', COUNT(*)
FROM public.debts d
JOIN target t ON d.user_id = t.user_id

UNION ALL
SELECT 'suppliers', COUNT(*)
FROM public.suppliers sp
JOIN target t ON sp.user_id = t.user_id

UNION ALL
SELECT 'purchases', COUNT(*)
FROM public.purchases p
JOIN target t ON p.user_id = t.user_id

UNION ALL
SELECT 'purchase_items', COUNT(*)
FROM public.purchase_items pi
JOIN public.purchases p ON p.id = pi.purchase_id
JOIN target t ON p.user_id = t.user_id

UNION ALL
SELECT 'expenses', COUNT(*)
FROM public.expenses e
JOIN target t ON e.user_id = t.user_id

UNION ALL
SELECT 'settings', COUNT(*)
FROM public.settings st
JOIN target t ON st.user_id = t.user_id

UNION ALL
SELECT 'invoices', COUNT(*)
FROM public.invoices inv
JOIN target t ON inv.user_id = t.user_id

UNION ALL
SELECT 'invoice_items', COUNT(*)
FROM public.invoice_items ii
JOIN public.invoices inv ON inv.id = ii.invoice_id
JOIN target t ON inv.user_id = t.user_id

UNION ALL
SELECT 'user_invoice_counter', COUNT(*)
FROM public.user_invoice_counter uic
JOIN target t ON uic.user_id = t.user_id

UNION ALL
SELECT 'support_conversations', COUNT(*)
FROM public.support_conversations sc
JOIN target t ON sc.owner_user_id = t.user_id

UNION ALL
SELECT 'support_messages', COUNT(*)
FROM public.support_messages sm
JOIN public.support_conversations sc ON sc.id = sm.conversation_id
JOIN target t ON sc.owner_user_id = t.user_id;
```

## Find User Id

If you know the email or mobile number but not the user id, run one of these first.

```sql
SELECT id, name, email, mobile_number, is_verified, created_at
FROM public.users
ORDER BY id ASC;
```

```sql
SELECT id, name, email, mobile_number, is_verified, created_at
FROM public.users
WHERE LOWER(email) = LOWER('user@example.com');
```

```sql
SELECT id, name, email, mobile_number, is_verified, created_at
FROM public.users
WHERE mobile_number = '1234567890';
```

## Notes

- `developer_admins` is not included in the user-related query because it is a global support admin table.
- Password hashes and token columns should not be exported or shared in screenshots.
- `purchase_items`, `invoice_items`, and `support_messages` must be filtered through their parent tables.
- If a table shows `row_count = 0`, that user has no related rows in that table.
