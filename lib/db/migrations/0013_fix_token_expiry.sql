-- Alter the expires_at column in the account table to use bigint
ALTER TABLE account ALTER COLUMN expires_at TYPE bigint USING expires_at::bigint; 