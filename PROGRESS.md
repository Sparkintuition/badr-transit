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

- **Step 7** — Payment tracking with per-client overdue logic: aged-receivables endpoint (`GET /api/invoices/aged-receivables`) returning buckets (current / 1-30j / 31-60j / 61-90j / 90j+) by client; client statement (`GET /api/clients/:id/statement`) and payment-summary (`GET /api/clients/:id/payment-summary`) endpoints; `payment_date_from`/`payment_date_to` and `sort_by` filters on invoice list; ClientDetailPage at `/app/clients/:id` with full invoice + job history; overdue column added to ClientsPage; "Voir relevé →" link in InvoiceDetailPage; sort dropdown in InvoicesListPage. Also fixed `db.transaction()` usage in `mark-paid` and `cancel` routes (node:sqlite uses manual BEGIN/COMMIT).
- **Step 8** — Expanded CEO dashboard: 4 alert cards (non-facturés, reçus manquants, en attente validation, factures en retard); 3 financial-pulse cards (encaissé ce mois, à encaisser, décaissements ce mois); aged-receivables stacked bar chart (CSS, no extra dep); top-clients-to-relance table; recent jobs + recent invoices row; auto-refresh every 60s with "Mis à jour à HH:mm" timestamp; logistics users see a separate LogisticsDashboard.jsx (their jobs, disbursements, open count, justificatifs à fournir).

- **Step 9** — Audit log viewer UI (admin only): `GET /api/audit-log` with filters (entity type, date range, search); table with action color badges, entity links, diff panel (old in red strikethrough / new in green); pagination 100/page.
- **Step 10** — Backup + Settings: `backend/src/scripts/backup.js` using `VACUUM INTO` (node:sqlite compatible), copies receipts + invoices, manifest.json, retention logic (keep min 7, purge >30d). Admin routes `POST /api/admin/backup-now`, `GET /api/admin/backup-info`, `GET/PUT /api/admin/settings` (whitelisted keys). `SettingsPage.jsx` with backup card, alert thresholds, numbering, company info. "Paramètres" added to admin nav. `npm run backup` script added.

- **Step 11** — Production deployment: single-process mode (`SERVE_FRONTEND=true`) where backend serves the built React app from `frontend/dist`; binds to `0.0.0.0:3000` for LAN access; CORS disabled in prod (same origin); `ecosystem.config.js` for PM2; root `package.json` with `install:all` / `build` / `start` convenience scripts; full deployment documentation in README.md.

- **Fiche dossier PDF** — On-demand printable job cover sheet matching the paper form, with live milestone status, QR code to job detail page, status badge, generation timestamp. Accessible from job detail page ("Imprimer fiche dossier" button). Supports both import and export layouts with type-appropriate DUM rows and milestone lists.

- **Déclarant / Commis split (Step 12)** — Restructured the logistics workflow:
  - **Terminology**: "Agent logistique" → "Déclarant" in all UI strings; `role='logistics'` unchanged in DB/code.
  - **New entity**: `commis_agents` table for outside agents (porters, customs runners) with no app login. Managed via `/app/commis` (admin/accountant only).
  - **New DB columns** (migration `008_declarant_and_commis.sql`): `jobs.declarant_user_id` (logistics user with app login), `jobs.commis_agent_id` (external commis); `job_assignments_log` table tracking every ownership change.
  - **Backend**: New `/api/commis-agents` CRUD; 4 new job endpoints: `claim-declarant`, `transfer-declarant`, `force-claim-declarant`, `release-declarant`; `GET /api/jobs/my-assignments` activity feed.
  - **Frontend**: `CommisAgentsPage.jsx`; `JobFormModal` updated (commis dropdown from commis_agents, declarant picker for admin/accountant only); `JobsListPage` with assignment pills (Mes dossiers / Non réclamés / Tous); `JobDetailPage` with claim/transfer/force-claim/release buttons + collapsible assignment history; both dashboards updated with "Dossiers non réclamés" count card; `LogisticsDashboard` shows recent assignment activity.
  - *(corrections)* Commis field simplified to free-text `commis_name` with autocomplete from past entries (migration `009_commis_freetext.sql`; `commis_agent_id` kept as legacy read-only, `commis_agents` table emptied and reserved for future use). "Libérer" action now requires a mandatory justification note (min 5 chars), logged in `job_assignments_log` with the motif visible in history. Removed "(agent externe)" label clutter from `JobFormModal`.

## Next
- App is feature-complete for all planned steps.
- To go live: run `npm run build`, then `pm2 start backend/ecosystem.config.js`.
- Optional: configure Windows Task Scheduler for daily backup.

## Users in the system (as of last session)
- CEO / admin (default, password changed by user)
- Sophie Comptable / accountant
- Karim Agent / logistics
- (possibly more)

## Real clients entered
- A few test clients. More to be added by the user.
