-- Rename check_copy_path → payment_proof_path (covers both chèque and virement)
ALTER TABLE disbursements RENAME COLUMN check_copy_path TO payment_proof_path;

-- Track whether a receipt will ever arrive (informal cash payments)
ALTER TABLE disbursements ADD COLUMN no_receipt_expected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE disbursements ADD COLUMN no_receipt_reason TEXT;

-- Alert threshold for missing receipts (days after signing)
INSERT OR IGNORE INTO settings (key, value) VALUES ('receipt_red_flag_days', '7');
