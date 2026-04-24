# Conventions

## Money
- ALWAYS store as `amount_cents` (INTEGER). Never floats.
- Backend helpers: `backend/src/utils/money.js` → `toCents`, `fromCents`, `formatMAD`.
- Frontend helpers: `frontend/src/utils/money.js` → `formatMAD`, `formatMADShort`, `parseMAD`.
- Display format: `5 000,00 MAD` (French: U+00A0 non-breaking space thousands, comma decimal, suffix ` MAD`).

## Dates
- Storage: ISO 8601 strings in SQLite (`datetime('now')` for timestamps, `YYYY-MM-DD` for date-only).
- Display: `DD/MM/YYYY` via `frontend/src/utils/format.js` → `formatDate`, `formatDateTime`.
- Never pass `Date` objects to the DB — convert to ISO string.

## Validation
- Backend uses zod. Keep schemas in `backend/src/validators/*.js`.
- On 400 validation errors, return `{ errors: { field: "message" } }` so the UI can show inline messages.
- French error messages for user-facing validation; English for server-side dev errors.

## Audit log
- Call `logAudit(db, { user_id, action, entity_type, entity_id, old_value?, new_value? })` from `backend/src/utils/audit.js` on every create/update/delete/state-change of significant entities.
- The helper strips password/pin fields before serializing.

## File uploads
- Use the multer middleware from `backend/src/middleware/upload.js`.
- Max 10 MB. Accept PDF, JPG, JPEG, PNG, WEBP. Reject others with 400.
- Store under `backend/data/receipts/YYYY/MM/job_<jobId>/`.
- Serve via auth-protected endpoints, never via direct filesystem paths.

## Colors (use INLINE hex, not custom Tailwind classes — the brand classes sometimes don't compile)
- App bg: `bg-[#1A1A1A]`
- Sidebar bg: `bg-[#141414]`
- Card bg: `bg-[#242424]`
- Border: `border-[#333333]`
- Text primary: `text-zinc-50`
- Text muted: `text-zinc-400`
- Primary button: `bg-[#1E3A8A] hover:bg-[#1E40AF] text-white`
- Secondary button: `border border-[#333333] text-zinc-300 hover:bg-[#2A2A2A]`
- Danger button: `bg-red-600 hover:bg-red-700 text-white`
- Link: `text-[#60A5FA] hover:underline`
- Active nav item: `bg-[#1E3A8A] text-white border-l-4 border-[#F59E0B]`
- Yellow accent (tab underline, small highlights): `border-[#F59E0B]` or `bg-[#F59E0B]`
- Status badges:
  - Success/active/paid: `bg-emerald-900/40 text-emerald-300 border border-emerald-800`
  - Warning/pending: `bg-amber-900/40 text-amber-300 border border-amber-800`
  - Danger/red-flag/overdue: `bg-red-900/40 text-red-300 border border-red-800`
  - Neutral/inactive: `bg-zinc-800 text-zinc-400`
  - Info (Import type): `bg-blue-900/40 text-blue-300 border border-blue-800`
  - Export type: `bg-amber-900/40 text-amber-300 border border-amber-800`

## Naming
- React components: PascalCase, one per file. Same name for file and component.
- Routes (Express): kebab-case URLs, verbs via HTTP methods.
- DB columns: snake_case.
- JS vars/functions: camelCase.

## Roles check (enforce everywhere)
- Backend: `requireAuth`, `requireRole('admin', 'accountant')` middleware. Enforce server-side always; client-side hiding is not enough.
- Frontend: Use `<ProtectedRoute roles={[...]}>` wrapping route components; conditionally render UI based on `user.role` from `AuthContext`.

## Things NOT to do
- Don't use `slate-*` Tailwind classes for backgrounds or borders (muddy against the dark theme).
- Don't hard-delete anything that has referential links. Soft delete via `active=0` or `archived=1`.
- Don't store or log raw passwords, PINs, or credit card info anywhere.
- Don't seed sample data in production code paths. Tests may seed; migrations should not.
- Don't skip audit logging for "small" changes. All mutations log.

## Domain vocabulary
- **Validation** (formerly "signature"): the CEO's approval of a disbursement. Applies to all payment methods (chèque, virement, espèces). The DB columns `signed_at` / `signed_by_user_id` and the status value `'signed'` are kept unchanged for stability; "validation" is the canonical user-facing term.
- **Alerts** (formerly "drapeaux rouges"): two types — **Non facturés** (validated more than `red_flag_days` days ago and not yet on an invoice) and **Reçus manquants** (validated more than `receipt_red_flag_days` days ago, receipt not uploaded, `no_receipt_expected` flag not set). Both thresholds are in the `settings` table.
- **payment_reference**: unified field for check numbers (`payment_method='check'`) and transfer references (`payment_method='transfer'`). Required for both; null/not applicable for cash. Stored in `disbursements.payment_reference` (previously `check_number`).
- **Alert timers**: all alert age calculations use `paid_date` (when money physically left the company), not `signed_at` (when the CEO approved in-app). This ensures back-dated disbursements are aged correctly.

## Tax logic (invoices)
- Service charges → **Taxable** column. TVA 20% by default; TVA 14% if `is_transport=true`.
- Disbursements (pass-through at cost) → **Non Taxable** column, no TVA.
- Taxe Régionale 4%: applied on `subtotal_taxable` only, toggleable per invoice (`taxe_regionale_applied`).
- All math in integer centimes: `Math.round(amount_cents * rate / 100)`. No floats in tax columns.
- Verify: `total_ttc = total_ht + tva_14 + tva_20 + taxe_regionale` exactly.

## Invoice lifecycle
- States: `draft → sent → paid` (or `overdue` — computed, not stored — and `cancelled`).
- `overdue` is any `status='sent'` invoice whose `due_date < today`. The DB always stores `'sent'`; the API enriches the response with `is_overdue` and `status='overdue'` virtually.
- **On create**: validated disbursements (`status='signed'`) → `invoiced`; service charges → linked; job → `invoiced`.
- **On mark-paid**: disbursements `invoice_id=this` → `reimbursed`; job → `paid`.
- **On cancel**: disbursements → `invoice_id=NULL, status='signed'` (revert); service_charges → `invoice_id=NULL`; job → `released`. PDF kept on disk.
- PDF stored at `backend/data/invoices/YYYY/{facture_number}.pdf`. Served via auth-protected `GET /api/invoices/:id/pdf`.

## Logistics roles and job ownership
- **Déclarant**: a logistics user (role `'logistics'`) who has claimed a job in-app. UI label is "Déclarant" everywhere; the DB column is `declarant_user_id` on `jobs` and the role value is still `'logistics'`.
- **Commis**: an external outside agent (porter, customs runner) with no app login, stored in the `commis_agents` table. Linked to jobs via `jobs.commis_agent_id`. Managed on `/app/commis`.
- **Legacy `commis_user_id`**: jobs created before the split have `commis_user_id` pointing to the `users` table. `buildFullJob()` returns both `commis_user` (legacy) and `commis` (new); the frontend displays `job.commis?.name || job.commis_user?.name`.
- **Ownership changes** must go through dedicated endpoints — never via `PUT /jobs/:id`:
  - `POST /:id/claim-declarant` — logistics claiming an unassigned job
  - `POST /:id/transfer-declarant` — logistics (if current declarant) or admin/accountant reassigning
  - `POST /:id/force-claim-declarant` — logistics overriding another declarant (requires note ≥ 5 chars, logged with `is_force_claim=1`)
  - `POST /:id/release-declarant` — current declarant or admin/accountant setting declarant to NULL
- All ownership changes are logged to `job_assignments_log` with `from_user_id`, `to_user_id`, `is_force_claim`, `note`.
- `jobUpdateSchema` deliberately omits `declarant_user_id` so `PUT /jobs/:id` cannot silently overwrite the declarant.

## Dashboards
- **Admin / Accountant dashboard** (`DashboardPage.jsx`): operational overview — 4+ alert cards (including "Dossiers non réclamés"), 3 financial-pulse cards, aged-receivables stacked bar, top clients to relance, recent jobs + invoices. Auto-refreshes every 60 seconds.
- **Logistics dashboard** (`LogisticsDashboard.jsx`): task-focused — their open jobs, disbursements, justificatifs à fournir count, unassigned dossiers count, recent assignment activity. Auto-refreshes every 60 seconds.
- Role branch: `DashboardPage` renders `<LogisticsDashboard />` when `user.role === 'logistics'`, full dashboard otherwise.
- `overdue` is a computed status (not stored in DB). `GET /api/invoices/aged-receivables` buckets all `status='sent'` invoices by days overdue (current / 1-30 / 31-60 / 61-90 / 90+).

## Deployment
- **Dev**: `npm run dev:backend` + `npm run dev:frontend` (two processes; Vite proxies `/api` to port 3000)
- **Prod**: `npm run build` then `pm2 start backend/ecosystem.config.js` (one process on port 3000)
- Frontend must be rebuilt (`npm run build`) before (re)starting prod — the backend serves `frontend/dist/`
- `NODE_ENV=production` or `SERVE_FRONTEND=true` activates static serving and disables CORS
- App binds to `0.0.0.0` — reachable from any device on the LAN at `http://<server-ip>:3000`
- PM2 auto-restarts on crash; `pm2-windows-startup` enables auto-start on Windows boot
- Windows Firewall must allow Node.js on port 3000 the first time it runs
- PM2 logs go to `backend/logs/` (excluded from git via `.gitignore`)

## PDF outputs
- All PDFs share the same header and footer rendering via `backend/src/services/pdfShared.js` (`renderPdfHeader`, `renderPdfFooter`). Any new PDF feature must use these functions for consistency.
- PDFs are stored in `backend/data/` subfolders by type: invoices in `data/invoices/YYYY/`, job sheets in `data/job_sheets/YYYY/MM/`. Job sheets are regenerated on every request (content changes); invoice PDFs are generated once and cached.
- QR code URLs in job sheet PDFs use the `app_url_base` setting (table `settings`, key `app_url_base`). Update this setting via the Paramètres page whenever the server IP changes.
- Job sheet PDF endpoint: `GET /api/jobs/:id/sheet-pdf` — accessible by all roles (admin, accountant, logistics; logistics restricted to their own jobs).

## Migrations
- Numbered SQL files in `backend/src/db/migrations/` (e.g., `003_feature_name.sql`).
- Track applied migrations in `schema_migrations` table.
- Idempotent where possible (CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE).
- Never edit an applied migration; write a new one.
