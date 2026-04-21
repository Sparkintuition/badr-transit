-- Add notes and cancelled_reason to invoices table
ALTER TABLE invoices ADD COLUMN notes TEXT;
ALTER TABLE invoices ADD COLUMN cancelled_reason TEXT;
