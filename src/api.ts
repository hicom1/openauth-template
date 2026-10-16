import * as v from "valibot";
import { calculateTotals } from "./invoice-math";

// REST API voor klanten, facturen en bedrijfsinstellingen. Elke query is
// beperkt tot de ingelogde gebruiker (userId).

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const text = (max = 500) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), "");
const requiredText = (label: string, max = 200) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, `${label} is verplicht`),
    v.maxLength(max),
  );
const isoDate = (label: string) =>
  v.pipe(
    v.string(),
    v.regex(/^\d{4}-\d{2}-\d{2}$/, `${label} moet een datum zijn (JJJJ-MM-DD)`),
  );

const CustomerSchema = v.object({
  name: requiredText("Naam"),
  contact_person: text(),
  email: text(),
  phone: text(),
  address: text(),
  postal_code: text(),
  city: text(),
  country: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), "Nederland"),
  vat_number: text(),
  coc_number: text(),
  notes: text(5000),
});

const ItemSchema = v.object({
  description: requiredText("Omschrijving", 1000),
  quantity: v.pipe(v.number(), v.finite(), v.minValue(-1e9), v.maxValue(1e9)),
  unit_price: v.pipe(v.number(), v.integer(), v.minValue(-1e12), v.maxValue(1e12)),
  vat_rate: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
});

const InvoiceSchema = v.object({
  customer_id: v.pipe(v.number(), v.integer()),
  issue_date: isoDate("Factuurdatum"),
  due_date: isoDate("Vervaldatum"),
  notes: text(5000),
  items: v.pipe(
    v.array(ItemSchema),
    v.minLength(1, "Een factuur heeft minimaal één regel nodig"),
    v.maxLength(200),
  ),
});

const STATUSES = ["concept", "verzonden", "betaald"] as const;
const StatusSchema = v.object({ status: v.picklist(STATUSES, "Ongeldige status") });

const SettingsSchema = v.object({
  company_name: text(200),
  address: text(),
  postal_code: text(),
  city: text(),
  country: text(100),
  email: text(),
  phone: text(),
  iban: text(100),
  vat_number: text(100),
  coc_number: text(100),
  invoice_prefix: text(20),
  next_invoice_number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  payment_term_days: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(365)),
  footer_text: text(2000),
});

type CustomerInput = v.InferOutput<typeof CustomerSchema>;
type InvoiceInput = v.InferOutput<typeof InvoiceSchema>;

export interface Settings extends v.InferOutput<typeof SettingsSchema> {}

export interface Customer extends CustomerInput {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: number;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

export interface Invoice {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: (typeof STATUSES)[number];
  notes: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  customer: Customer;
}

async function parseBody<T extends v.GenericSchema>(
  request: Request,
  schema: T,
): Promise<v.InferOutput<T>> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    throw new HttpError(400, "Ongeldige JSON");
  }
  const result = v.safeParse(schema, data);
  if (!result.success) {
    const issue = result.issues[0];
    const path = v.getDotPath(issue);
    throw new HttpError(400, path ? `${path}: ${issue.message}` : issue.message);
  }
  return result.output;
}

export async function handleApi(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const [, resource, idPart, action] = url.pathname.split("/").filter(Boolean);
  const id = idPart === undefined ? undefined : Number(idPart);
  const method = request.method;
  const db = env.AUTH_DB;

  try {
    if (id !== undefined && !Number.isSafeInteger(id)) {
      throw new HttpError(404, "Niet gevonden");
    }

    if (resource === "customers") {
      if (id === undefined && action === undefined) {
        if (method === "GET") return Response.json(await listCustomers(db, userId, url));
        if (method === "POST") {
          const input = await parseBody(request, CustomerSchema);
          return Response.json(await createCustomer(db, userId, input), { status: 201 });
        }
      } else if (id !== undefined && action === undefined) {
        if (method === "GET") return Response.json(await getCustomer(db, userId, id));
        if (method === "PUT") {
          const input = await parseBody(request, CustomerSchema);
          return Response.json(await updateCustomer(db, userId, id, input));
        }
        if (method === "DELETE") {
          await deleteCustomer(db, userId, id);
          return new Response(null, { status: 204 });
        }
      }
    }

    if (resource === "invoices") {
      if (id === undefined && action === undefined) {
        if (method === "GET") return Response.json(await listInvoices(db, userId, url));
        if (method === "POST") {
          const input = await parseBody(request, InvoiceSchema);
          return Response.json(await createInvoice(db, userId, input), { status: 201 });
        }
      } else if (id !== undefined && action === undefined) {
        if (method === "GET") return Response.json(await getInvoice(db, userId, id));
        if (method === "PUT") {
          const input = await parseBody(request, InvoiceSchema);
          return Response.json(await updateInvoice(db, userId, id, input));
        }
        if (method === "DELETE") {
          await deleteInvoice(db, userId, id);
          return new Response(null, { status: 204 });
        }
      } else if (id !== undefined && action === "status" && method === "POST") {
        const { status } = await parseBody(request, StatusSchema);
        return Response.json(await setInvoiceStatus(db, userId, id, status));
      }
    }

    if (resource === "settings" && id === undefined) {
      if (method === "GET") return Response.json(await getSettings(db, userId));
      if (method === "PUT") {
        const input = await parseBody(request, SettingsSchema);
        return Response.json(await saveSettings(db, userId, input));
      }
    }

    throw new HttpError(404, "Niet gevonden");
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Interne serverfout" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Klanten

const CUSTOMER_COLUMNS = [
  "name",
  "contact_person",
  "email",
  "phone",
  "address",
  "postal_code",
  "city",
  "country",
  "vat_number",
  "coc_number",
  "notes",
] as const;

async function listCustomers(db: D1Database, userId: string, url: URL) {
  const q = url.searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;
  const { results } = await db
    .prepare(
      `SELECT c.*,
              COUNT(i.id) AS invoice_count,
              COALESCE(SUM(CASE WHEN i.status = 'verzonden' THEN i.total END), 0) AS open_amount
       FROM customer c
       LEFT JOIN invoice i ON i.customer_id = c.id
       WHERE c.user_id = ?1
         AND (?2 = '' OR c.name LIKE ?3 OR c.contact_person LIKE ?3
              OR c.email LIKE ?3 OR c.city LIKE ?3)
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`,
    )
    .bind(userId, q, like)
    .all();
  return results;
}

export async function getCustomer(
  db: D1Database,
  userId: string,
  id: number,
): Promise<Customer> {
  const customer = await db
    .prepare(`SELECT * FROM customer WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<Customer>();
  if (!customer) throw new HttpError(404, "Klant niet gevonden");
  return customer;
}

async function createCustomer(db: D1Database, userId: string, input: CustomerInput) {
  const values = CUSTOMER_COLUMNS.map((col) => input[col]);
  return db
    .prepare(
      `INSERT INTO customer (user_id, ${CUSTOMER_COLUMNS.join(", ")})
       VALUES (?, ${CUSTOMER_COLUMNS.map(() => "?").join(", ")})
       RETURNING *`,
    )
    .bind(userId, ...values)
    .first<Customer>();
}

async function updateCustomer(
  db: D1Database,
  userId: string,
  id: number,
  input: CustomerInput,
) {
  const values = CUSTOMER_COLUMNS.map((col) => input[col]);
  const customer = await db
    .prepare(
      `UPDATE customer
       SET ${CUSTOMER_COLUMNS.map((col) => `${col} = ?`).join(", ")},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?
       RETURNING *`,
    )
    .bind(...values, id, userId)
    .first<Customer>();
  if (!customer) throw new HttpError(404, "Klant niet gevonden");
  return customer;
}

async function deleteCustomer(db: D1Database, userId: string, id: number) {
  await getCustomer(db, userId, id);
  const used = await db
    .prepare(`SELECT COUNT(*) AS n FROM invoice WHERE customer_id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<{ n: number }>();
  if (used && used.n > 0) {
    throw new HttpError(
      409,
      "Deze klant heeft facturen en kan daarom niet worden verwijderd",
    );
  }
  await db
    .prepare(`DELETE FROM customer WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
}

// ---------------------------------------------------------------------------
// Facturen

const INVOICE_SELECT = `
  SELECT i.*, c.name AS customer_name
  FROM invoice i
  JOIN customer c ON c.id = i.customer_id`;

async function listInvoices(db: D1Database, userId: string, url: URL) {
  const status = url.searchParams.get("status") ?? "";
  const customerId = Number(url.searchParams.get("customer_id") ?? 0) || 0;
  const q = url.searchParams.get("q")?.trim() ?? "";
  const { results } = await db
    .prepare(
      `${INVOICE_SELECT}
       WHERE i.user_id = ?1
         AND (?2 = '' OR i.status = ?2)
         AND (?3 = 0 OR i.customer_id = ?3)
         AND (?4 = '' OR i.invoice_number LIKE ?5 OR c.name LIKE ?5)
       ORDER BY i.issue_date DESC, i.id DESC`,
    )
    .bind(userId, status, customerId, q, `%${q}%`)
    .all<Invoice>();
  return results;
}

export async function getInvoice(
  db: D1Database,
  userId: string,
  id: number,
): Promise<InvoiceDetail> {
  const invoice = await db
    .prepare(`${INVOICE_SELECT} WHERE i.id = ? AND i.user_id = ?`)
    .bind(id, userId)
    .first<Invoice>();
  if (!invoice) throw new HttpError(404, "Factuur niet gevonden");
  const [{ results: items }, customer] = await Promise.all([
    db
      .prepare(
        `SELECT id, position, description, quantity, unit_price, vat_rate
         FROM invoice_item WHERE invoice_id = ? ORDER BY position`,
      )
      .bind(id)
      .all<InvoiceItem>(),
    getCustomer(db, userId, invoice.customer_id),
  ]);
  return { ...invoice, items, customer };
}

function itemStatements(
  db: D1Database,
  invoiceIdSql: string,
  invoiceIdParams: unknown[],
  items: InvoiceInput["items"],
) {
  return items.map((item, index) =>
    db
      .prepare(
        `INSERT INTO invoice_item
           (invoice_id, position, description, quantity, unit_price, vat_rate)
         VALUES (${invoiceIdSql}, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ...invoiceIdParams,
        index + 1,
        item.description,
        item.quantity,
        item.unit_price,
        item.vat_rate,
      ),
  );
}

async function createInvoice(db: D1Database, userId: string, input: InvoiceInput) {
  await getCustomer(db, userId, input.customer_id);
  const totals = calculateTotals(input.items);

  // Factuurnummer toekennen, factuur en regels opslaan en de teller ophogen
  // gebeurt in één transactie (D1 batch), zodat nummers uniek en
  // opeenvolgend blijven.
  const results = await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO company_settings (user_id) VALUES (?)`)
      .bind(userId),
    db
      .prepare(
        `INSERT INTO invoice
           (user_id, customer_id, invoice_number, issue_date, due_date, notes,
            subtotal, vat_amount, total)
         SELECT ?1, ?2, invoice_prefix || printf('%04d', next_invoice_number),
                ?3, ?4, ?5, ?6, ?7, ?8
         FROM company_settings WHERE user_id = ?1
         RETURNING id`,
      )
      .bind(
        userId,
        input.customer_id,
        input.issue_date,
        input.due_date,
        input.notes,
        totals.subtotal,
        totals.vat_amount,
        totals.total,
      ),
    ...itemStatements(
      db,
      `(SELECT MAX(id) FROM invoice WHERE user_id = ?)`,
      [userId],
      input.items,
    ),
    db
      .prepare(
        `UPDATE company_settings SET next_invoice_number = next_invoice_number + 1
         WHERE user_id = ?`,
      )
      .bind(userId),
  ]);
  const created = results[1].results[0] as { id: number } | undefined;
  if (!created) throw new Error("Factuur kon niet worden aangemaakt");
  return getInvoice(db, userId, created.id);
}

async function updateInvoice(
  db: D1Database,
  userId: string,
  id: number,
  input: InvoiceInput,
) {
  const existing = await getInvoice(db, userId, id);
  if (existing.status !== "concept") {
    throw new HttpError(
      409,
      "Alleen conceptfacturen kunnen worden gewijzigd. Zet de status eerst terug naar concept.",
    );
  }
  await getCustomer(db, userId, input.customer_id);
  const totals = calculateTotals(input.items);
  await db.batch([
    db
      .prepare(
        `UPDATE invoice
         SET customer_id = ?, issue_date = ?, due_date = ?, notes = ?,
             subtotal = ?, vat_amount = ?, total = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        input.customer_id,
        input.issue_date,
        input.due_date,
        input.notes,
        totals.subtotal,
        totals.vat_amount,
        totals.total,
        id,
        userId,
      ),
    db.prepare(`DELETE FROM invoice_item WHERE invoice_id = ?`).bind(id),
    ...itemStatements(db, "?", [id], input.items),
  ]);
  return getInvoice(db, userId, id);
}

async function setInvoiceStatus(
  db: D1Database,
  userId: string,
  id: number,
  status: Invoice["status"],
) {
  const result = await db
    .prepare(
      `UPDATE invoice SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
    .bind(status, id, userId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "Factuur niet gevonden");
  return getInvoice(db, userId, id);
}

async function deleteInvoice(db: D1Database, userId: string, id: number) {
  const existing = await getInvoice(db, userId, id);
  if (existing.status !== "concept") {
    throw new HttpError(409, "Alleen conceptfacturen kunnen worden verwijderd");
  }
  await db.batch([
    db.prepare(`DELETE FROM invoice_item WHERE invoice_id = ?`).bind(id),
    db.prepare(`DELETE FROM invoice WHERE id = ? AND user_id = ?`).bind(id, userId),
  ]);
}

// ---------------------------------------------------------------------------
// Bedrijfsinstellingen

export async function getSettings(db: D1Database, userId: string): Promise<Settings> {
  const settings = await db
    .prepare(`SELECT * FROM company_settings WHERE user_id = ?`)
    .bind(userId)
    .first<Settings & { user_id: string }>();
  if (settings) {
    const { user_id: _, ...rest } = settings;
    return rest;
  }
  return {
    company_name: "",
    address: "",
    postal_code: "",
    city: "",
    country: "Nederland",
    email: "",
    phone: "",
    iban: "",
    vat_number: "",
    coc_number: "",
    invoice_prefix: "F",
    next_invoice_number: 1,
    payment_term_days: 30,
    footer_text: "",
  };
}

async function saveSettings(db: D1Database, userId: string, input: Settings) {
  const columns = Object.keys(input) as (keyof Settings)[];
  await db
    .prepare(
      `INSERT INTO company_settings (user_id, ${columns.join(", ")})
       VALUES (?, ${columns.map(() => "?").join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET
       ${columns.map((col) => `${col} = excluded.${col}`).join(", ")}`,
    )
    .bind(userId, ...columns.map((col) => input[col]))
    .run();
  return getSettings(db, userId);
}
