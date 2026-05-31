# User Related Data Query Guide

Last updated: `2026-05-31`

This guide explains how to check and export all database data related to one specific application user from pgAdmin.

Schema source: `migrations/full_updated_schema.sql`

## Purpose

Use this when you need to inspect or export one user's data table-wise, for example user id `7`.

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
4. Paste the `Single CSV One Sheet Export Query` from the next section.
5. Change `SELECT 7::INT AS user_id` to the user id you want to inspect.
6. Click Execute.
7. In the result grid, click the download/export button and save the result as `.csv`.
8. Open the CSV in Excel.

CSV output format:

- `section_no`: table order.
- `table_name`: source table name.
- `row_type`: `HEADER` or `DATA`.
- `row_no`: row number inside that table.
- `col_01` to `col_20`: actual table columns and values.

For every table, the first row is `HEADER`. That row contains the real column names for that table. The next `DATA` rows contain that table's values for the selected user.

## Single CSV One Sheet Export Query

This query returns one flat result grid that can be exported from pgAdmin as one CSV file. It does not use JSON output. Sensitive password and token values are shown as `[hidden]`.

```sql
WITH target AS (
  SELECT 7::INT AS user_id
),
export_rows AS (

  SELECT 1 AS sort_no, 'users' AS table_name, 'HEADER' AS row_type, 0::BIGINT AS row_no,
    ARRAY[
      'id', 'name', 'email', 'mobile_number', 'password_hash', 'is_verified',
      'google_sub', 'google_email_verified', 'google_picture_url',
      'verify_token', 'reset_token', 'reset_token_expires',
      'created_at', 'updated_at'
    ]::TEXT[] AS cols
  UNION ALL
  SELECT 1, 'users', 'DATA', ROW_NUMBER() OVER (ORDER BY u.id),
    ARRAY[
      u.id::TEXT, u.name, u.email, u.mobile_number, '[hidden]', u.is_verified::TEXT,
      u.google_sub, u.google_email_verified::TEXT, u.google_picture_url,
      '[hidden]', '[hidden]', u.reset_token_expires::TEXT,
      u.created_at::TEXT, u.updated_at::TEXT
    ]::TEXT[]
  FROM public.users u
  JOIN target t ON u.id = t.user_id

  UNION ALL
  SELECT 2, 'staff_accounts', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'owner_user_id', 'name', 'username', 'password_hash',
      'page_permissions', 'is_active', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 2, 'staff_accounts', 'DATA', ROW_NUMBER() OVER (ORDER BY sa.id),
    ARRAY[
      sa.id::TEXT, sa.owner_user_id::TEXT, sa.name, sa.username, '[hidden]',
      sa.page_permissions::TEXT, sa.is_active::TEXT, sa.created_at::TEXT, sa.updated_at::TEXT
    ]::TEXT[]
  FROM public.staff_accounts sa
  JOIN target t ON sa.owner_user_id = t.user_id

  UNION ALL
  SELECT 3, 'items', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'name', 'quantity', 'buying_rate',
      'selling_rate', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 3, 'items', 'DATA', ROW_NUMBER() OVER (ORDER BY i.id),
    ARRAY[
      i.id::TEXT, i.user_id::TEXT, i.name, i.quantity::TEXT, i.buying_rate::TEXT,
      i.selling_rate::TEXT, i.created_at::TEXT, i.updated_at::TEXT
    ]::TEXT[]
  FROM public.items i
  JOIN target t ON i.user_id = t.user_id

  UNION ALL
  SELECT 4, 'sales', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'item_id', 'quantity', 'cost_price',
      'selling_price', 'total_price', 'gst_amount', 'created_at'
    ]::TEXT[]
  UNION ALL
  SELECT 4, 'sales', 'DATA', ROW_NUMBER() OVER (ORDER BY s.created_at DESC, s.id DESC),
    ARRAY[
      s.id::TEXT, s.user_id::TEXT, s.item_id::TEXT, s.quantity::TEXT, s.cost_price::TEXT,
      s.selling_price::TEXT, s.total_price::TEXT, s.gst_amount::TEXT, s.created_at::TEXT
    ]::TEXT[]
  FROM public.sales s
  JOIN target t ON s.user_id = t.user_id

  UNION ALL
  SELECT 5, 'debts', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'customer_name', 'customer_number', 'total',
      'credit', 'balance', 'remark', 'created_at', 'updated_at', 'invoice_id'
    ]::TEXT[]
  UNION ALL
  SELECT 5, 'debts', 'DATA', ROW_NUMBER() OVER (ORDER BY d.created_at DESC, d.id DESC),
    ARRAY[
      d.id::TEXT, d.user_id::TEXT, d.customer_name, d.customer_number, d.total::TEXT,
      d.credit::TEXT, d.balance::TEXT, d.remark, d.created_at::TEXT, d.updated_at::TEXT,
      d.invoice_id::TEXT
    ]::TEXT[]
  FROM public.debts d
  JOIN target t ON d.user_id = t.user_id

  UNION ALL
  SELECT 6, 'suppliers', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'name', 'mobile_number', 'address', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 6, 'suppliers', 'DATA', ROW_NUMBER() OVER (ORDER BY sp.id),
    ARRAY[
      sp.id::TEXT, sp.user_id::TEXT, sp.name, sp.mobile_number, sp.address,
      sp.created_at::TEXT, sp.updated_at::TEXT
    ]::TEXT[]
  FROM public.suppliers sp
  JOIN target t ON sp.user_id = t.user_id

  UNION ALL
  SELECT 7, 'purchases', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'supplier_id', 'bill_no', 'purchase_date',
      'subtotal', 'amount_paid', 'amount_due', 'payment_mode',
      'payment_status', 'note', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 7, 'purchases', 'DATA', ROW_NUMBER() OVER (ORDER BY p.purchase_date DESC, p.id DESC),
    ARRAY[
      p.id::TEXT, p.user_id::TEXT, p.supplier_id::TEXT, p.bill_no, p.purchase_date::TEXT,
      p.subtotal::TEXT, p.amount_paid::TEXT, p.amount_due::TEXT, p.payment_mode,
      p.payment_status, p.note, p.created_at::TEXT, p.updated_at::TEXT
    ]::TEXT[]
  FROM public.purchases p
  JOIN target t ON p.user_id = t.user_id

  UNION ALL
  SELECT 8, 'purchase_items', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'purchase_id', 'item_name', 'quantity', 'buying_rate',
      'selling_rate', 'line_total'
    ]::TEXT[]
  UNION ALL
  SELECT 8, 'purchase_items', 'DATA', ROW_NUMBER() OVER (ORDER BY p.purchase_date DESC, p.id DESC, pi.id),
    ARRAY[
      pi.id::TEXT, pi.purchase_id::TEXT, pi.item_name, pi.quantity::TEXT, pi.buying_rate::TEXT,
      pi.selling_rate::TEXT, pi.line_total::TEXT
    ]::TEXT[]
  FROM public.purchase_items pi
  JOIN public.purchases p ON p.id = pi.purchase_id
  JOIN target t ON p.user_id = t.user_id

  UNION ALL
  SELECT 9, 'expenses', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'title', 'category', 'amount',
      'payment_mode', 'expense_date', 'note', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 9, 'expenses', 'DATA', ROW_NUMBER() OVER (ORDER BY e.expense_date DESC, e.id DESC),
    ARRAY[
      e.id::TEXT, e.user_id::TEXT, e.title, e.category, e.amount::TEXT,
      e.payment_mode, e.expense_date::TEXT, e.note, e.created_at::TEXT, e.updated_at::TEXT
    ]::TEXT[]
  FROM public.expenses e
  JOIN target t ON e.user_id = t.user_id

  UNION ALL
  SELECT 10, 'settings', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'shop_name', 'shop_address', 'gst_no',
      'gst_rate', 'default_profit_percent'
    ]::TEXT[]
  UNION ALL
  SELECT 10, 'settings', 'DATA', ROW_NUMBER() OVER (ORDER BY st.id),
    ARRAY[
      st.id::TEXT, st.user_id::TEXT, st.shop_name, st.shop_address, st.gst_no,
      st.gst_rate::TEXT, st.default_profit_percent::TEXT
    ]::TEXT[]
  FROM public.settings st
  JOIN target t ON st.user_id = t.user_id

  UNION ALL
  SELECT 11, 'invoices', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'user_id', 'invoice_no', 'gst_no', 'customer_name',
      'contact', 'address', 'date', 'subtotal', 'gst_amount',
      'total_amount', 'payment_mode', 'payment_status', 'amount_paid',
      'amount_due', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 11, 'invoices', 'DATA', ROW_NUMBER() OVER (ORDER BY inv.date DESC, inv.id DESC),
    ARRAY[
      inv.id::TEXT, inv.user_id::TEXT, inv.invoice_no, inv.gst_no, inv.customer_name,
      inv.contact, inv.address, inv.date::TEXT, inv.subtotal::TEXT, inv.gst_amount::TEXT,
      inv.total_amount::TEXT, inv.payment_mode, inv.payment_status, inv.amount_paid::TEXT,
      inv.amount_due::TEXT, inv.created_at::TEXT, inv.updated_at::TEXT
    ]::TEXT[]
  FROM public.invoices inv
  JOIN target t ON inv.user_id = t.user_id

  UNION ALL
  SELECT 12, 'invoice_items', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'invoice_id', 'description', 'quantity', 'rate', 'amount'
    ]::TEXT[]
  UNION ALL
  SELECT 12, 'invoice_items', 'DATA', ROW_NUMBER() OVER (ORDER BY inv.date DESC, inv.id DESC, ii.id),
    ARRAY[
      ii.id::TEXT, ii.invoice_id::TEXT, ii.description, ii.quantity::TEXT, ii.rate::TEXT,
      ii.amount::TEXT
    ]::TEXT[]
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  JOIN target t ON inv.user_id = t.user_id

  UNION ALL
  SELECT 13, 'user_invoice_counter', 'HEADER', 0::BIGINT,
    ARRAY[
      'user_id', 'date_key', 'next_no', 'created_at'
    ]::TEXT[]
  UNION ALL
  SELECT 13, 'user_invoice_counter', 'DATA', ROW_NUMBER() OVER (ORDER BY uic.date_key DESC),
    ARRAY[
      uic.user_id::TEXT, uic.date_key::TEXT, uic.next_no::TEXT, uic.created_at::TEXT
    ]::TEXT[]
  FROM public.user_invoice_counter uic
  JOIN target t ON uic.user_id = t.user_id

  UNION ALL
  SELECT 14, 'support_conversations', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'owner_user_id', 'requester_actor_id', 'requester_role',
      'requester_name', 'requester_identifier', 'status', 'unread_for_user',
      'unread_for_developer', 'last_message_at', 'created_at', 'updated_at'
    ]::TEXT[]
  UNION ALL
  SELECT 14, 'support_conversations', 'DATA', ROW_NUMBER() OVER (ORDER BY sc.updated_at DESC, sc.id DESC),
    ARRAY[
      sc.id::TEXT, sc.owner_user_id::TEXT, sc.requester_actor_id::TEXT, sc.requester_role,
      sc.requester_name, sc.requester_identifier, sc.status, sc.unread_for_user::TEXT,
      sc.unread_for_developer::TEXT, sc.last_message_at::TEXT, sc.created_at::TEXT,
      sc.updated_at::TEXT
    ]::TEXT[]
  FROM public.support_conversations sc
  JOIN target t ON sc.owner_user_id = t.user_id

  UNION ALL
  SELECT 15, 'support_messages', 'HEADER', 0::BIGINT,
    ARRAY[
      'id', 'conversation_id', 'sender_type', 'sender_actor_id',
      'sender_role', 'sender_name', 'message_text', 'created_at'
    ]::TEXT[]
  UNION ALL
  SELECT 15, 'support_messages', 'DATA', ROW_NUMBER() OVER (ORDER BY sm.created_at ASC, sm.id ASC),
    ARRAY[
      sm.id::TEXT, sm.conversation_id::TEXT, sm.sender_type, sm.sender_actor_id::TEXT,
      sm.sender_role, sm.sender_name, sm.message_text, sm.created_at::TEXT
    ]::TEXT[]
  FROM public.support_messages sm
  JOIN public.support_conversations sc ON sc.id = sm.conversation_id
  JOIN target t ON sc.owner_user_id = t.user_id

)
SELECT
  sort_no AS section_no,
  table_name,
  row_type,
  row_no,
  cols[1] AS col_01,
  cols[2] AS col_02,
  cols[3] AS col_03,
  cols[4] AS col_04,
  cols[5] AS col_05,
  cols[6] AS col_06,
  cols[7] AS col_07,
  cols[8] AS col_08,
  cols[9] AS col_09,
  cols[10] AS col_10,
  cols[11] AS col_11,
  cols[12] AS col_12,
  cols[13] AS col_13,
  cols[14] AS col_14,
  cols[15] AS col_15,
  cols[16] AS col_16,
  cols[17] AS col_17,
  cols[18] AS col_18,
  cols[19] AS col_19,
  cols[20] AS col_20
FROM export_rows
ORDER BY
  sort_no,
  CASE WHEN row_type = 'HEADER' THEN 0 ELSE 1 END,
  row_no;
```

## Optional JSON Check Query

Use this only when you want compact table-wise JSON preview inside pgAdmin.

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
