-- Migration number: 0002 	 2026-10-16T12:00:00.000Z
-- Klantendatabase en facturatie. Alle gegevens zijn per ingelogde gebruiker
-- gescheiden via user_id. Bedragen worden opgeslagen in centen (INTEGER).

CREATE TABLE IF NOT EXISTS company_settings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id),
    company_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'Nederland',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    vat_number TEXT NOT NULL DEFAULT '',
    coc_number TEXT NOT NULL DEFAULT '',
    invoice_prefix TEXT NOT NULL DEFAULT 'F',
    next_invoice_number INTEGER NOT NULL DEFAULT 1,
    payment_term_days INTEGER NOT NULL DEFAULT 30,
    footer_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES user(id),
    name TEXT NOT NULL,
    contact_person TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT 'Nederland',
    vat_number TEXT NOT NULL DEFAULT '',
    coc_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS customer_user_name ON customer (user_id, name);

CREATE TABLE IF NOT EXISTS invoice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES user(id),
    customer_id INTEGER NOT NULL REFERENCES customer(id),
    invoice_number TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'concept'
        CHECK (status IN ('concept', 'verzonden', 'betaald')),
    notes TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL DEFAULT 0,
    vat_amount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoice_user_date ON invoice (user_id, issue_date);
CREATE INDEX IF NOT EXISTS invoice_customer ON invoice (customer_id);

CREATE TABLE IF NOT EXISTS invoice_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price INTEGER NOT NULL,
    vat_rate REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS invoice_item_invoice ON invoice_item (invoice_id, position);
