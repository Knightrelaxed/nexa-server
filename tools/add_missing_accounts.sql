-- Buat akun "Bank Mandiri" sebagai satu-satunya akun utama untuk migrasi ini.
-- Tipe: bank
-- Saldo Awal: 0
INSERT INTO accounts (name, type, initial_balance, currency, color, icon_key)
SELECT 'Bank Mandiri', 'bank', 0, 'IDR', '#0ea5e9', 'landmark'
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE lower(name) = 'bank mandiri'
);
