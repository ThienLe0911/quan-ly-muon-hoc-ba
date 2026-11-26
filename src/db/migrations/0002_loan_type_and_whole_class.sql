ALTER TABLE loan_records ADD COLUMN loan_type TEXT NOT NULL DEFAULT 'INDIVIDUAL' CHECK(loan_type IN ('INDIVIDUAL', 'WHOLE_CLASS'));

ALTER TABLE loan_records ADD COLUMN class_year_key TEXT NOT NULL DEFAULT '';

ALTER TABLE loan_records ADD COLUMN quantity INTEGER;

CREATE INDEX IF NOT EXISTS idx_loan_class_year_status
  ON loan_records(class_year_key, status);
