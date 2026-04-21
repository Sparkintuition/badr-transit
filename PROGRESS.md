# Progress

## Completed
- **Step 1** — Project skeleton: folder structure, SQLite schema v1 (users, clients, jobs, disbursements, invoices, invoice_lines, service_charges, audit_log, cash_expenses, settings), default admin user, hello-world frontend confirming backend connection.
- **Step 2** — Authentication: login page (password for admin/accountant, 4-digit PIN for logistics), session management, role-based routing, user management page (admin only), change-password page, rate limiting on login, audit logging.
- **Step 2.5** — Schema extensions migration `002_jobs_extension.sql`: added job type (import/export), commis_user_id, inspecteur, recu_le, expediteur_exportateur, and other job fields; new tables `job_dums`, `job_milestones`, `disbursement_type_suggestions`; seeded 12 disbursement type labels; migration tracking via `schema_migrations` table.
- **Rebrand** — Applied BADR TRANSIT logo and brand colors (navy + yellow accents on neutral dark theme). Logo at `/logo.png`.
- **Step 3** — Clients CRUD: full list page (search, filters, status), create/edit modal, role-based actions (admin/accountant create/edit, admin-only delete with safety checks), deactivation safeguards when client has active jobs.
- **Step 4** — Jobs management: list page with filters (type, status, client, commis, search), job form modal (type-aware), detail page with milestones (status transitions), DUMs CRUD, service charges (admin/accountant only), disbursements section (read-only from this page — creation happens in Step 5), job status transitions, archive/unarchive.
- **Step 5** — Disbursement workflow: check requests, CEO signature queue, payment proof upload mandatory for check/transfer at signing, receipt tracking, dual alert system (invoice >3d + receipt missing >7d), no_receipt_expected flag for informal cash, CEO dashboard widgets, disbursement CRUD tied to jobs. Migration `003_disbursement_workflow_fixes.sql`: renamed `check_copy_path` → `payment_proof_path`, added `no_receipt_expected`, `no_receipt_reason`, `receipt_red_flag_days` setting.

## Step 5 fixes (post-completion)
- Renamed "Signer/Signé/signature" → "Valider/Validé/validation" throughout the UI to cover all payment methods, not just checks. DB columns (`signed_at`, `signed_by_user_id`) unchanged.
- Backend: added `POST /:id/validate` as primary endpoint; `POST /:id/sign` kept as deprecated alias. Audit log action changed from `'sign'` to `'validate'` for new entries.
- Verified receipt red flag SQL applies uniformly to checks, transfers, and receipt-expected cash payments — no `payment_method` filter in the query.
- Alert day-counts now computed from `paid_date` (when money left the company), not `signed_at` (when the CEO validated in-app), correctly handling back-dated entries. Field renamed: `days_since_signed` → `days_since_paid`, `is_red_flag` → `is_red_flag_invoice`.
- Renamed `check_number` → `payment_reference` (generalized for checks AND bank transfer references). Migration `004_payment_reference.sql`. Required for both `check` and `transfer` payment methods; not applicable to cash.

- **Step 6** — Invoices: auto-populated lines from validated disbursements (non-taxable) and service charges (taxable, TVA 14/20%), tax math in integer cents (no float drift), Taxe Régionale 4% toggleable per invoice, French number-to-words (`amountToFrenchWords`), PDF generation matching BADR TRANSIT layout (header, shipment box, two-column line table, totals box, legal footer), payment tracking that cascades disbursement → reimbursed + job → paid, cancel-with-revert, overdue badge in sidebar. Migrations `005_invoices_completion.sql` (notes + cancelled_reason) and `006_company_info.sql` (company settings for PDF footer).

## Next
- **Step 7** — Invoice payment tracking, overdue flagging per client payment deadline.
- **Step 8** — Expanded CEO dashboard (clients owed breakdown, monthly summaries).
- **Step 9** — Audit log viewer UI (admin).
- **Step 10** — Backup script (nightly copy of db + receipts to configurable folder).

## Users in the system (as of last session)
- CEO / admin (default, password changed by user)
- Sophie Comptable / accountant
- Karim Agent / logistics
- (possibly more)

## Real clients entered
- A few test clients. More to be added by the user.
