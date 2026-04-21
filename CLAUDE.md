# BADR TRANSIT — Système de gestion

Internal app for a Moroccan customs-clearance / transit company (Casablanca). Helps the CEO track fees paid on behalf of clients so none are forgotten when invoicing.

## Stack
- Backend: Node.js + Express + better-sqlite3 (file: `backend/data/badr_transit.db`)
- Frontend: React + Vite + Tailwind CSS
- Auth: express-session with SQLite-backed store, bcrypt passwords, bcrypt PINs
- File uploads: multer, stored under `backend/data/receipts/YYYY/MM/job_<id>/`
- UI language: French. Code/comments: English.

## Run
- `cd backend && npm run dev` (port 3000)
- `cd frontend && npm run dev` (port 5173, proxies /api to backend)
- Migrations run automatically on backend startup from `backend/src/db/migrations/`

## Roles
- `admin` (CEO) — everything, including signing disbursements and user management
- `accountant` (Comptable) — financial operations, invoicing, most things except user mgmt and disbursement signing
- `logistics` (Agent logistique) — operational tasks only; uses 4-digit PIN login; sees only their own jobs/disbursements by default

## Key business rules
- All money stored as INTEGER centimes, never floats. Helpers in `backend/src/utils/money.js` and `frontend/src/utils/money.js`.
- Dates: DD/MM/YYYY on UI, ISO in DB.
- Currency format: `5 000,00 MAD` (space thousands, comma decimal, French style).
- Two job types: `import` and `export`, each with predefined milestones (see `backend/src/constants/milestones.js`).
- Jobs can have multiple DUM (customs declaration) numbers — separate `job_dums` table.
- Disbursement lifecycle: pending_signature → signed → invoiced → reimbursed (or cancelled).
- Red flag: disbursement `signed` for more than `settings.red_flag_days` (default 3) without being invoiced.
- Invoice tax logic: service fees go in Taxable column (20% TVA default, 14% if transport). Disbursements paid on behalf of client go in Non-Taxable column (pass-through, no TVA on reimbursement). Taxe Régionale 4% applies on taxable subtotal only.
- Audit log: every mutation to a significant entity is logged to `audit_log` table via `backend/src/utils/audit.js`. Never store password/pin fields in audit values.

## Theme (visual)
- Dark neutral theme, NOT slate-blue. Use zinc/stone/neutral grays and inline hex.
- App bg `#1A1A1A`, sidebar `#141414`, cards `#242424`, borders `#333333`.
- Brand navy `#1E3A8A` (primary buttons, active nav bg), hover `#1E40AF`.
- Brand yellow `#F59E0B` (active nav left border, tab underlines, small accents).
- Logo at `/logo.png` (frontend/public/logo.png), transparent background. Render bare — no wrapper container with background.

## Don't
- Don't use slate-* Tailwind classes for backgrounds (muddy against the black).
- Don't use floats for money. Always integer cents.
- Don't build features beyond the currently requested step.
- Don't modify existing migrations — add a new numbered one.
- Don't seed sample data — the user enters real data.

## Ask before
- Adding npm dependencies beyond what's obvious for the task
- Changing the DB schema for a field that already exists
- Touching auth / permission logic when the task is a feature elsewhere
