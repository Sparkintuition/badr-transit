-- Generalize check_number to cover both check numbers and transfer references
ALTER TABLE disbursements RENAME COLUMN check_number TO payment_reference;
